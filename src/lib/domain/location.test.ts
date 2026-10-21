import { describe, expect, it } from "vitest";

import {
  boundingBox,
  distanceKm,
  formatLocationLabel,
  isInTurkey,
  isMorePrecise,
  publicLocation,
  uncertaintyRadiusMeters,
} from "./location";
import { rankFor, rankProgress } from "./ranks";

describe("isInTurkey", () => {
  it("accepts Turkish cities and rejects places abroad", () => {
    expect(isInTurkey(41.0082, 28.9784)).toBe(true);
    expect(isInTurkey(39.9334, 32.8597)).toBe(true);
    expect(isInTurkey(48.8566, 2.3522)).toBe(false);
    expect(isInTurkey(Number.NaN, 30)).toBe(false);
  });
});

describe("publicLocation", () => {
  const point = { latitude: 41.012345, longitude: 29.034567 };

  it("returns null without coordinates", () => {
    expect(publicLocation({ latitude: null, longitude: 29, precision: "city", sensitive: false })).toBeNull();
  });

  it("keeps precise points for ordinary stories", () => {
    expect(publicLocation({ ...point, precision: "exact", sensitive: false })).toEqual({ ...point, precision: "exact" });
  });

  it("snaps precise points of sensitive stories to neighborhood level", () => {
    const result = publicLocation({ ...point, precision: "street", sensitive: true });
    expect(result?.precision).toBe("neighborhood");
    expect(result?.latitude).not.toBe(point.latitude);
    expect(Math.abs((result?.latitude ?? 0) - point.latitude)).toBeLessThan(0.003);
    expect(Math.abs((result?.longitude ?? 0) - point.longitude)).toBeLessThan(0.003);
  });

  it("leaves already coarse sensitive locations unchanged", () => {
    expect(publicLocation({ ...point, precision: "district", sensitive: true })).toEqual({ ...point, precision: "district" });
  });
});

describe("precision helpers", () => {
  it("orders precisions from exact to unknown", () => {
    expect(isMorePrecise("street", "district")).toBe(true);
    expect(isMorePrecise("city", "neighborhood")).toBe(false);
    expect(uncertaintyRadiusMeters("district")).toBeGreaterThan(uncertaintyRadiusMeters("neighborhood"));
  });
});

describe("geometry", () => {
  it("measures distances between cities", () => {
    const istanbul = { latitude: 41.0082, longitude: 28.9784 };
    const ankara = { latitude: 39.9334, longitude: 32.8597 };
    expect(distanceKm(istanbul, ankara)).toBeGreaterThan(340);
    expect(distanceKm(istanbul, ankara)).toBeLessThan(360);
  });

  it("builds a bounding box around a point", () => {
    const box = boundingBox(41, 29, 10);
    expect(box.south).toBeLessThan(41);
    expect(box.north).toBeGreaterThan(41);
    expect(box.west).toBeLessThan(29);
    expect(box.east).toBeGreaterThan(29);
  });
});

describe("formatLocationLabel", () => {
  it("joins known parts without duplicates", () => {
    expect(formatLocationLabel({ neighborhood: "Moda", district: "Kadıköy", province: "İstanbul" })).toBe("Moda, Kadıköy, İstanbul");
    expect(formatLocationLabel({ district: "Merkez", province: "Merkez" })).toBe("Merkez");
    expect(formatLocationLabel({ fallback: "Ege kıyıları" })).toBe("Ege kıyıları");
  });
});

describe("ranks", () => {
  it("finds the rank for a point total", () => {
    expect(rankFor(0).key).toBe("observer");
    expect(rankFor(120).key).toBe("neighborhood_reporter");
    expect(rankFor(60_000).key).toBe("national_hero");
  });

  it("reports progress to the next rank", () => {
    expect(rankProgress(50)).toMatchObject({ remaining: 50, progress: 0.5 });
    expect(rankProgress(60_000)).toBeNull();
  });
});
