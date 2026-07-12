import { describe, expect, it } from "vitest";

import { parseObservation } from "@/features/event-pipeline/domain/observation";

const baseObservation = {
  id: "018f6f44-8144-7d8a-b5a3-3ecab5ea3931",
  provider: "x",
  providerItemId: "1900123456789012345",
  canonicalUrl: "https://x.com/i/web/status/1900123456789012345",
  authorExternalId: "1800123456789012345",
  publishedAt: "2026-07-12T08:00:00.000Z",
  capturedAt: "2026-07-12T08:00:05.000Z",
  language: "tr",
  text: "Taksim Metro çıkışında yol kapatıldı.",
  media: [],
  geoHints: [],
} as const;

describe("parseObservation", () => {
  it("keeps provider IDs as lossless strings", () => {
    const observation = parseObservation(baseObservation);

    expect(observation.providerItemId).toBe("1900123456789012345");
    expect(typeof observation.providerItemId).toBe("string");
  });

  it("accepts zero-valued provider coordinates without treating them as event location", () => {
    const observation = parseObservation({
      ...baseObservation,
      geoHints: [
        {
          kind: "post_coordinates",
          relation: "post_origin",
          latitude: 0,
          longitude: 0,
        },
      ],
    });

    expect(observation.geoHints[0]).toEqual({
      kind: "post_coordinates",
      relation: "post_origin",
      latitude: 0,
      longitude: 0,
    });
  });

  it.each([
    { latitude: 91, longitude: 29 },
    { latitude: -91, longitude: 29 },
    { latitude: 41, longitude: 181 },
    { latitude: 41, longitude: -181 },
    { latitude: Number.NaN, longitude: 29 },
  ])("rejects invalid provider coordinates: %o", (coordinates) => {
    expect(() =>
      parseObservation({
        ...baseObservation,
        geoHints: [
          {
            kind: "post_coordinates",
            relation: "post_origin",
            ...coordinates,
          },
        ],
      }),
    ).toThrow();
  });

  it("requires text or media and rejects unknown boundary fields", () => {
    expect(() =>
      parseObservation({
        ...baseObservation,
        text: "",
        media: [],
      }),
    ).toThrow();

    expect(() =>
      parseObservation({
        ...baseObservation,
        inferredLatitude: 41.036,
      }),
    ).toThrow();
  });
});
