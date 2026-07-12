import { describe, expect, it } from "vitest";

import { projectPublicLocation } from "@/features/event-pipeline/domain/public-projection";

const resolvedLocation = {
  status: "resolved",
  candidate: {
    id: "atlas:address:private-building",
    name: "Örnek Bina No: 10",
    dataset: { name: "hgm-atlas", version: "2026-07" },
    granularity: "address",
    point: { latitude: 41.031_234, longitude: 28.978_765 },
    ancestors: [
      {
        id: "atlas:neighborhood:cihangir",
        name: "Cihangir",
        granularity: "neighborhood",
        point: { latitude: 41.032, longitude: 28.981 },
      },
      {
        id: "atlas:district:beyoglu",
        name: "Beyoğlu",
        granularity: "district",
        point: { latitude: 41.037, longitude: 28.977 },
      },
      {
        id: "atlas:province:istanbul",
        name: "İstanbul",
        granularity: "province",
        point: { latitude: 41.013, longitude: 28.955 },
      },
    ],
  },
  confidence: 0.97,
  calibratedPrecision: 0.96,
  calibrationId: "tr-address-v1",
  supportingEvidenceIds: ["evidence:1", "evidence:2"],
} as const;

describe("projectPublicLocation", () => {
  it("publishes exact low-risk locations only when evidence and calibration are strong", () => {
    const result = projectPublicLocation({
      resolution: resolvedLocation,
      sensitivity: "low",
    });

    expect(result).toEqual({
      status: "publish",
      location: {
        placeId: "atlas:address:private-building",
        name: "Örnek Bina No: 10",
        granularity: "address",
        point: { latitude: 41.031_234, longitude: 28.978_765 },
        coarsened: false,
      },
    });
  });

  it("uses an authoritative district centroid for high-sensitivity incidents", () => {
    const result = projectPublicLocation({
      resolution: resolvedLocation,
      sensitivity: "high",
    });

    expect(result).toEqual({
      status: "publish",
      location: {
        placeId: "atlas:district:beyoglu",
        name: "Beyoğlu",
        granularity: "district",
        point: { latitude: 41.037, longitude: 28.977 },
        coarsened: true,
      },
    });
    expect(result).not.toEqual(
      expect.objectContaining({ point: resolvedLocation.candidate.point }),
    );
  });

  it("holds rather than leaking exact coordinates when a safe ancestor is absent", () => {
    const result = projectPublicLocation({
      resolution: {
        ...resolvedLocation,
        candidate: { ...resolvedLocation.candidate, ancestors: [] },
      },
      sensitivity: "critical",
    });

    expect(result).toEqual({ status: "hold", reason: "no_safe_projection" });
  });

  it("does not invent a fallback location for abstained resolutions", () => {
    const result = projectPublicLocation({
      resolution: { status: "abstained", reason: "no_candidates" },
      sensitivity: "low",
    });

    expect(result).toEqual({
      status: "hold",
      reason: "location_unresolved",
    });
  });
});
