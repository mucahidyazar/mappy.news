import { describe, expect, it } from "vitest";

import { resolveLocation } from "@/features/event-pipeline/domain/location-resolution";

const district = {
  id: "atlas:district:beyoglu",
  name: "Beyoğlu",
  granularity: "district",
  point: { latitude: 41.037, longitude: 28.977 },
} as const;

const taksimCandidate = {
  id: "atlas:poi:taksim-metro",
  name: "Taksim Metro İstasyonu",
  dataset: { name: "hgm-atlas", version: "2026-07" },
  granularity: "poi",
  point: { latitude: 41.0369, longitude: 28.985 },
  ancestors: [district],
} as const;

const evidence = [
  {
    id: "evidence:post",
    observationId: "observation:1",
    kind: "poi_mention",
    relation: "event_site",
    origin: "post_text",
    reliability: 0.92,
  },
  {
    id: "evidence:article",
    observationId: "observation:2",
    kind: "linked_authoritative_address",
    relation: "event_site",
    origin: "linked_document",
    reliability: 0.98,
  },
] as const;

describe("resolveLocation", () => {
  it("resolves only gazetteer candidates supported by independent event-site evidence", () => {
    const result = resolveLocation({
      evidence,
      candidates: [taksimCandidate],
      matches: [
        {
          evidenceId: "evidence:post",
          candidateId: taksimCandidate.id,
          signals: ["exact_name", "hierarchy"],
        },
        {
          evidenceId: "evidence:article",
          candidateId: taksimCandidate.id,
          signals: ["authority_id", "exact_name"],
        },
      ],
      calibration: [
        {
          granularity: "poi",
          estimatedPrecision: 0.96,
          calibrationId: "tr-poi-v1",
          cohort: "tr:x-linked-document",
          sampleSize: 800,
        },
      ],
    });

    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.candidate).toEqual(taksimCandidate);
      expect(result.supportingEvidenceIds).toEqual([
        "evidence:article",
        "evidence:post",
      ]);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("abstains when location-like metadata is not evidence of the event site", () => {
    const result = resolveLocation({
      evidence: [
        {
          id: "evidence:profile",
          observationId: "observation:1",
          kind: "profile_location",
          relation: "reporter_location",
          origin: "author_profile",
          reliability: 0.9,
        },
      ],
      candidates: [taksimCandidate],
      matches: [
        {
          evidenceId: "evidence:profile",
          candidateId: taksimCandidate.id,
          signals: ["exact_name"],
        },
      ],
      calibration: [
        {
          granularity: "poi",
          estimatedPrecision: 0.99,
          calibrationId: "profile-v1",
          cohort: "tr:profile",
          sampleSize: 1_000,
        },
      ],
    });

    expect(result).toEqual({
      status: "abstained",
      reason: "insufficient_evidence",
    });
  });

  it("abstains instead of guessing when two candidates are too close", () => {
    const secondCandidate = {
      ...taksimCandidate,
      id: "atlas:poi:taksim-square",
      name: "Taksim Meydanı",
      point: { latitude: 41.037, longitude: 28.9853 },
    } as const;

    const result = resolveLocation({
      evidence,
      candidates: [taksimCandidate, secondCandidate],
      matches: evidence.flatMap((item) => [
        {
          evidenceId: item.id,
          candidateId: taksimCandidate.id,
          signals: ["exact_name"] as const,
        },
        {
          evidenceId: item.id,
          candidateId: secondCandidate.id,
          signals: ["alias"] as const,
        },
      ]),
      calibration: [
        {
          granularity: "poi",
          estimatedPrecision: 0.95,
          calibrationId: "tr-poi-v1",
          cohort: "tr:x",
          sampleSize: 800,
        },
      ],
    });

    expect(result).toEqual({ status: "abstained", reason: "ambiguous" });
  });

  it("abstains when a cohort has no precision calibration", () => {
    const result = resolveLocation({
      evidence,
      candidates: [taksimCandidate],
      matches: evidence.map((item) => ({
        evidenceId: item.id,
        candidateId: taksimCandidate.id,
        signals: ["authority_id", "exact_name"] as const,
      })),
      calibration: [],
    });

    expect(result).toEqual({ status: "abstained", reason: "uncalibrated" });
  });
});
