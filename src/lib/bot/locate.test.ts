import { describe, expect, it } from "vitest";

import type { BotAnalysis } from "@/lib/domain/types";
import type { Geocoder } from "@/lib/geo/geocoder";
import type { GeocodeCandidate } from "@/lib/geo/nominatim";

import { geocodeQueries, locate, pickCandidate } from "./locate";

const location: BotAnalysis["location"] = {
  mention: "Kadıköy Moda Caddesi",
  province: "İstanbul",
  district: "Kadıköy",
  neighborhood: "Caferağa",
  street: "Moda Caddesi",
  place: null,
  precision: "street",
  confidence: 0.9,
  evidence: "",
};

function candidate(overrides: Partial<GeocodeCandidate>): GeocodeCandidate {
  return {
    latitude: 40.98,
    longitude: 29.03,
    displayName: "Kadıköy, İstanbul",
    precision: "district",
    province: "İstanbul",
    district: "Kadıköy",
    neighborhood: null,
    provider: "nominatim",
    street: null,
    importance: 0.5,
    placeRank: 16,
    ...overrides,
  };
}

describe("geocodeQueries", () => {
  it("goes from the most to the least specific query", () => {
    expect(geocodeQueries({ ...location, street: null }).map((query) => query.query)).toEqual(["Caferağa, Kadıköy, İstanbul", "Kadıköy, İstanbul", "İstanbul"]);
  });

  it("always keeps the district or province as the last of three queries", () => {
    const village = { ...location, place: "Hisar Köyü mevkisi", street: "Suvermez Köyü yolu", neighborhood: "Hisar Köyü", district: null, province: "Afyonkarahisar" };
    expect(geocodeQueries(village)).toEqual([
      { query: "Hisar, Afyonkarahisar", level: "street" },
      { query: "Suvermez Köyü yolu, Hisar, Afyonkarahisar", level: "street" },
      { query: "Afyonkarahisar", level: "city" },
    ]);
    expect(geocodeQueries(location).map((query) => query.query)).toEqual(["Moda Caddesi, Caferağa, Kadıköy, İstanbul", "Caferağa, Kadıköy, İstanbul", "Kadıköy, İstanbul"]);
  });

  it("leaves the central district (Merkez) out of the queries", () => {
    const central = { ...location, street: null, neighborhood: "Meşrutiyet", district: "Merkez", province: "Zonguldak" };
    expect(geocodeQueries(central).map((query) => query.query)).toEqual(["Meşrutiyet, Zonguldak", "Zonguldak"]);
  });

  it("skips street guesses when the model is unsure", () => {
    expect(geocodeQueries({ ...location, confidence: 0.3 })[0]).toEqual({ query: "Caferağa, Kadıköy, İstanbul", level: "neighborhood" });
  });
});

describe("pickCandidate", () => {
  it("rejects results in another province or district", () => {
    const wrong = candidate({ province: "Ankara", district: "Kadıköy" });
    const right = candidate({ precision: "neighborhood" });
    expect(pickCandidate([wrong, right], { province: "İstanbul", district: "Kadıköy" })).toBe(right);
    expect(pickCandidate([candidate({ district: "Üsküdar" })], { province: "İstanbul", district: "Kadıköy" })).toBeNull();
  });
});

describe("locate", () => {
  it("never claims more precision than the query that matched", async () => {
    const searched: string[] = [];
    const geocoder: Geocoder = {
      async search(query) {
        searched.push(query);
        return query.startsWith("Moda") ? [] : [candidate({ precision: "street", neighborhood: "Caferağa" })];
      },
      async reverse() {
        return null;
      },
    };
    const result = await locate(geocoder, location);
    expect(searched).toEqual(["Moda Caddesi, Caferağa, Kadıköy, İstanbul", "Caferağa, Kadıköy, İstanbul"]);
    expect(result).toMatchObject({ precision: "neighborhood", confidence: 0.77, queries: 2, geocode: { precision: "neighborhood" } });
  });

  it("treats a central district that Nominatim types as a city as district level", async () => {
    const geocoder: Geocoder = {
      async search() {
        return [candidate({ precision: "city", district: "Konak", province: "İzmir" })];
      },
      async reverse() {
        return null;
      },
    };
    const konak = { ...location, mention: "Konak", district: "Konak", province: "İzmir", neighborhood: null, street: null, precision: "district" as const };
    expect(await locate(geocoder, konak)).toMatchObject({ precision: "district", geocode: { precision: "district", district: "Konak" } });
  });

  it("gives up after a few queries", async () => {
    let calls = 0;
    const geocoder: Geocoder = {
      async search() {
        calls += 1;
        return [];
      },
      async reverse() {
        return null;
      },
    };
    expect(await locate(geocoder, location)).toMatchObject({ geocode: null, precision: "unknown", confidence: 0 });
    expect(calls).toBe(3);
  });
});
