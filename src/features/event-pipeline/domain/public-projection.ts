import { z } from "zod";

import {
  locationGranularitySchema,
  locationResolutionSchema,
} from "@/features/event-pipeline/domain/location-resolution";

const MIN_PUBLIC_CONFIDENCE = 0.9;
const MIN_PUBLIC_CALIBRATED_PRECISION = 0.9;
const MIN_SUPPORTING_EVIDENCE = 2;

const sensitivitySchema = z.enum(["low", "medium", "high", "critical"]);

const projectionInputSchema = z
  .object({
    resolution: locationResolutionSchema,
    sensitivity: sensitivitySchema,
  })
  .strict();

const publicLocationSchema = z
  .object({
    placeId: z.string().min(1),
    name: z.string().min(1),
    granularity: locationGranularitySchema,
    point: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
      })
      .strict(),
    coarsened: z.boolean(),
  })
  .strict();

export const publicLocationProjectionSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("publish"),
      location: publicLocationSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("hold"),
      reason: z.enum([
        "location_unresolved",
        "insufficient_precision",
        "no_safe_projection",
      ]),
    })
    .strict(),
]);

export type PublicLocationProjection = z.infer<
  typeof publicLocationProjectionSchema
>;

type ResolvedLocation = Extract<
  z.infer<typeof locationResolutionSchema>,
  { status: "resolved" }
>;
type Place = ResolvedLocation["candidate"]["ancestors"][number];

function requiredGranularity(
  sensitivity: z.infer<typeof sensitivitySchema>,
): z.infer<typeof locationGranularitySchema> | undefined {
  switch (sensitivity) {
    case "low":
      return undefined;
    case "medium":
      return "neighborhood";
    case "high":
      return "district";
    case "critical":
      return "province";
  }
}

function toPublicLocation(place: Place, coarsened: boolean) {
  return Object.freeze({
    placeId: place.id,
    name: place.name,
    granularity: place.granularity,
    point: Object.freeze({ ...place.point }),
    coarsened,
  });
}

export function projectPublicLocation(input: unknown): PublicLocationProjection {
  const parsed = projectionInputSchema.parse(input);

  if (parsed.resolution.status === "abstained") {
    return Object.freeze({
      status: "hold",
      reason: "location_unresolved",
    });
  }

  if (
    parsed.resolution.confidence < MIN_PUBLIC_CONFIDENCE ||
    parsed.resolution.calibratedPrecision < MIN_PUBLIC_CALIBRATED_PRECISION ||
    parsed.resolution.supportingEvidenceIds.length < MIN_SUPPORTING_EVIDENCE
  ) {
    return Object.freeze({
      status: "hold",
      reason: "insufficient_precision",
    });
  }

  const targetGranularity = requiredGranularity(parsed.sensitivity);

  if (targetGranularity === undefined) {
    return Object.freeze({
      status: "publish",
      location: toPublicLocation(parsed.resolution.candidate, false),
    });
  }

  const safePlace =
    parsed.resolution.candidate.granularity === targetGranularity
      ? parsed.resolution.candidate
      : parsed.resolution.candidate.ancestors.find(
          ({ granularity }) => granularity === targetGranularity,
        );

  if (safePlace === undefined) {
    return Object.freeze({
      status: "hold",
      reason: "no_safe_projection",
    });
  }

  return Object.freeze({
    status: "publish",
    location: toPublicLocation(
      safePlace,
      safePlace.id !== parsed.resolution.candidate.id,
    ),
  });
}
