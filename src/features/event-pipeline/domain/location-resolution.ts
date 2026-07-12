import { z } from "zod";

const MIN_EVIDENCE_RELIABILITY = 0.75;
const MIN_CALIBRATED_PRECISION = 0.9;
const MIN_CALIBRATION_SAMPLE_SIZE = 100;
const MIN_INDEPENDENT_OBSERVATIONS = 2;

const latitudeSchema = z.number().finite().min(-90).max(90);
const longitudeSchema = z.number().finite().min(-180).max(180);

export const locationGranularitySchema = z.enum([
  "country",
  "province",
  "district",
  "neighborhood",
  "street",
  "address",
  "poi",
]);

const pointSchema = z
  .object({
    latitude: latitudeSchema,
    longitude: longitudeSchema,
  })
  .strict();

export const placeReferenceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    granularity: locationGranularitySchema,
    point: pointSchema,
  })
  .strict();

export const locationCandidateSchema = placeReferenceSchema
  .extend({
    dataset: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
      })
      .strict(),
    ancestors: z.array(placeReferenceSchema),
  })
  .strict();

const locationEvidenceSchema = z
  .object({
    id: z.string().min(1),
    observationId: z.string().min(1),
    kind: z.string().min(1),
    relation: z.string().min(1),
    origin: z.string().min(1),
    reliability: z.number().finite().min(0).max(1),
  })
  .strict();

const candidateMatchSchema = z
  .object({
    evidenceId: z.string().min(1),
    candidateId: z.string().min(1),
    signals: z.array(z.string().min(1)).min(1),
  })
  .strict();

const calibrationSchema = z
  .object({
    granularity: locationGranularitySchema,
    estimatedPrecision: z.number().finite().min(0).max(1),
    calibrationId: z.string().min(1),
    cohort: z.string().min(1),
    sampleSize: z.number().int().nonnegative(),
  })
  .strict();

const locationResolutionInputSchema = z
  .object({
    evidence: z.array(locationEvidenceSchema),
    candidates: z.array(locationCandidateSchema),
    matches: z.array(candidateMatchSchema),
    calibration: z.array(calibrationSchema),
  })
  .strict()
  .superRefine((input, context) => {
    const evidenceIds = new Set(input.evidence.map(({ id }) => id));
    const candidateIds = new Set(input.candidates.map(({ id }) => id));

    input.matches.forEach((match, index) => {
      if (!evidenceIds.has(match.evidenceId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A candidate match references unknown evidence.",
          path: ["matches", index, "evidenceId"],
        });
      }

      if (!candidateIds.has(match.candidateId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A candidate match references an unknown candidate.",
          path: ["matches", index, "candidateId"],
        });
      }
    });
  });

export const locationResolutionSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("resolved"),
      candidate: locationCandidateSchema,
      confidence: z.number().finite().min(0).max(1),
      calibratedPrecision: z.number().finite().min(0).max(1),
      calibrationId: z.string().min(1),
      supportingEvidenceIds: z.array(z.string().min(1)).min(2),
    })
    .strict(),
  z
    .object({
      status: z.literal("abstained"),
      reason: z.enum([
        "no_candidates",
        "insufficient_evidence",
        "ambiguous",
        "uncalibrated",
      ]),
    })
    .strict(),
]);

type ParsedResolutionInput = z.infer<typeof locationResolutionInputSchema>;
type Candidate = ParsedResolutionInput["candidates"][number];
type Evidence = ParsedResolutionInput["evidence"][number];
type PlaceReference = Candidate["ancestors"][number];
type ReadonlyPoint = Readonly<Candidate["point"]>;
type ReadonlyPlaceReference = Readonly<
  Omit<PlaceReference, "point"> & { readonly point: ReadonlyPoint }
>;
type ReadonlyCandidate = Readonly<
  Omit<Candidate, "point" | "dataset" | "ancestors"> & {
    readonly point: ReadonlyPoint;
    readonly dataset: Readonly<Candidate["dataset"]>;
    readonly ancestors: readonly ReadonlyPlaceReference[];
  }
>;

export type LocationResolution =
  | Readonly<{
      status: "resolved";
      candidate: ReadonlyCandidate;
      confidence: number;
      calibratedPrecision: number;
      calibrationId: string;
      supportingEvidenceIds: readonly string[];
    }>
  | Readonly<{
      status: "abstained";
      reason:
        | "no_candidates"
        | "insufficient_evidence"
        | "ambiguous"
        | "uncalibrated";
    }>;

interface SupportedCandidate {
  readonly candidate: Candidate;
  readonly evidence: ReadonlyArray<Evidence>;
}

function freezeCandidate(candidate: Candidate): ReadonlyCandidate {
  return Object.freeze({
    ...candidate,
    point: Object.freeze({ ...candidate.point }),
    dataset: Object.freeze({ ...candidate.dataset }),
    ancestors: Object.freeze(
      candidate.ancestors.map((ancestor) =>
        Object.freeze({
          ...ancestor,
          point: Object.freeze({ ...ancestor.point }),
        }),
      ),
    ),
  });
}

function collectSupportedCandidates(
  input: ParsedResolutionInput,
): ReadonlyArray<SupportedCandidate> {
  const evidenceById = new Map(
    input.evidence
      .filter(
        (item) =>
          item.relation === "event_site" &&
          item.reliability >= MIN_EVIDENCE_RELIABILITY,
      )
      .map((item) => [item.id, item] as const),
  );

  return input.candidates.flatMap((candidate) => {
    const matchedEvidence = Array.from(
      new Map(
        input.matches
          .filter(({ candidateId }) => candidateId === candidate.id)
          .flatMap(({ evidenceId }) => {
            const item = evidenceById.get(evidenceId);
            return item === undefined ? [] : [[item.id, item] as const];
          }),
      ).values(),
    );
    const independentObservations = new Set(
      matchedEvidence.map(({ observationId }) => observationId),
    );

    return independentObservations.size >= MIN_INDEPENDENT_OBSERVATIONS
      ? [{ candidate, evidence: matchedEvidence }]
      : [];
  });
}

export function resolveLocation(input: unknown): LocationResolution {
  const parsed = locationResolutionInputSchema.parse(input);

  if (parsed.candidates.length === 0) {
    return Object.freeze({ status: "abstained", reason: "no_candidates" });
  }

  const supportedCandidates = collectSupportedCandidates(parsed);

  if (supportedCandidates.length === 0) {
    return Object.freeze({
      status: "abstained",
      reason: "insufficient_evidence",
    });
  }

  if (supportedCandidates.length > 1) {
    return Object.freeze({ status: "abstained", reason: "ambiguous" });
  }

  const supportedCandidate = supportedCandidates[0];
  const eligibleCalibrations = parsed.calibration.filter(
    (item) =>
      item.granularity === supportedCandidate.candidate.granularity &&
      item.sampleSize >= MIN_CALIBRATION_SAMPLE_SIZE &&
      item.estimatedPrecision >= MIN_CALIBRATED_PRECISION,
  );
  const calibration = eligibleCalibrations.reduce<
    ParsedResolutionInput["calibration"][number] | undefined
  >(
    (best, item) =>
      best === undefined || item.estimatedPrecision > best.estimatedPrecision
        ? item
        : best,
    undefined,
  );

  if (calibration === undefined) {
    return Object.freeze({ status: "abstained", reason: "uncalibrated" });
  }

  const averageEvidenceReliability =
    supportedCandidate.evidence.reduce(
      (total, item) => total + item.reliability,
      0,
    ) / supportedCandidate.evidence.length;
  const supportingEvidenceIds = supportedCandidate.evidence
    .map(({ id }) => id)
    .toSorted();

  return Object.freeze({
    status: "resolved",
    candidate: freezeCandidate(supportedCandidate.candidate),
    confidence: Math.min(
      averageEvidenceReliability,
      calibration.estimatedPrecision,
    ),
    calibratedPrecision: calibration.estimatedPrecision,
    calibrationId: calibration.calibrationId,
    supportingEvidenceIds: Object.freeze(supportingEvidenceIds),
  });
}
