import { describe, expect, it } from "vitest";

import { isCentralDistrict, localityName, normalizeAddressPart, normalizeHouseNumber, roadNames, streetBase, streetNamePattern, streetSpellings } from "./address";
import { meetingPoints } from "./geometry";
import { parsePlace } from "./nominatim";
import { clusterPoints, OverpassClient } from "./overpass";
import { parsePhotonFeature } from "./photon";
import { isPlaceName, placeNameScore, sameWord } from "./place-names";
import { boxSizeKm } from "./types";

describe("address parts", () => {
  it("expands Turkish abbreviations and calms ALL-CAPS text", () => {
    expect(normalizeAddressPart("Atatürk Cad.")).toBe("Atatürk Caddesi");
    expect(normalizeAddressPart("Caferağa Mah. Moda Cd.")).toBe("Caferağa Mahallesi Moda Caddesi");
    expect(normalizeAddressPart("DEMİR SK.")).toBe("Demir Sokak");
    expect(normalizeAddressPart("Bağdat Bulv")).toBe("Bağdat Bulvarı");
    expect(normalizeAddressPart("  ")).toBeNull();
  });

  it("strips the words around a locality", () => {
    expect(localityName("Hisar Köyü mevkisi")).toBe("Hisar");
    expect(localityName("Zeytinburnu Sahil Parkı önü")).toBe("Zeytinburnu Sahil Parkı");
    expect(localityName("Mecidiyeköy")).toBe("Mecidiyeköy");
  });

  it("reads house numbers", () => {
    expect(normalizeHouseNumber("No: 12/A")).toBe("12/A");
    expect(normalizeHouseNumber("12 numaralı")).toBe("12");
    expect(normalizeHouseNumber("yok")).toBeNull();
  });

  it("recognizes central districts", () => {
    expect(isCentralDistrict("Merkez")).toBe(true);
    expect(isCentralDistrict("Zonguldak Merkez")).toBe(true);
    expect(isCentralDistrict("Merkezefendi")).toBe(false);
  });

  it("builds Overpass name patterns that tolerate OSM spellings", () => {
    const pattern = new RegExp(streetNamePattern("Demir Sk.")!, "i");
    expect(pattern.test("Demir Sokak")).toBe(true);
    expect(pattern.test("Demir Sokağı")).toBe(true);
    expect(pattern.test("Demirci Sokak")).toBe(false);
    const numbered = new RegExp(streetNamePattern("1203/1 Sokak")!, "i");
    expect(numbered.test("1203/1. Sokak")).toBe(true);
    expect(streetNamePattern("Sk.")).toBeNull();
  });
});

describe("road and street names", () => {
  it("knows the everyday names of national roads", () => {
    expect(roadNames("TEM Otoyolu")).toEqual(["TEM Otoyolu", "Avrupa Otoyolu", "Anadolu Otoyolu"]);
    expect(roadNames("E-5 kara yolu")).toEqual(["E-5 kara yolu", "D-100"]);
    expect(roadNames("D 100")).toEqual(["D-100"]);
    expect(streetBase("Demir Sk.")).toBe("Demir");
  });

  it("spells numbered streets both ways OSM writes them", () => {
    expect(streetSpellings("2453. Caddesi")).toEqual(["2453. Caddesi", "2453. Cadde"]);
    expect(streetSpellings("2472 Cad.")).toEqual(["2472 Caddesi", "2472 Cadde"]);
    expect(streetSpellings("1453/2 Sokağı")).toEqual(["1453/2 Sokağı", "1453/2 Sokak"]);
    expect(streetSpellings("Demir Sokak")).toEqual(["Demir Sokak"]);
  });
});

describe("place names", () => {
  it("matches Turkish inflections but not other words", () => {
    expect(sameWord("park", "parki")).toBe(true);
    expect(sameWord("site", "sitesinde")).toBe(true);
    expect(sameWord("mobilyacilar", "mobilyacilari")).toBe(true);
    expect(sameWord("sokak", "sokagi")).toBe(true);
    expect(sameWord("yeni", "yenice")).toBe(false);
    expect(sameWord("kartal", "kartaltepe")).toBe(false);
    expect(sameWord("alt", "altin")).toBe(false);
    expect(sameWord("10", "100")).toBe(false);
  });

  it("needs the words that tell a place apart, and the same kind of place", () => {
    const hatay = ["Hatay", "Antakya"];
    expect(placeNameScore("Antakya Mobilyacıları Sanayi Sitesi", "Yeni Sanayi Sitesi Eczanesi", hatay)).toBe(0);
    expect(placeNameScore("Antakya Mobilyacıları İhtisas Sanayi Sitesi", "Mobilyacılar Sitesi", hatay)).toBe(1);
    expect(placeNameScore("Uşak Tekstil Organize Sanayi Bölgesi", "Uşak Deri OSB", ["Uşak"])).toBe(0);
    expect(placeNameScore("Uşak Deri Organize Sanayi Bölgesi", "Uşak Deri (Karma) OSB", ["Uşak"])).toBeGreaterThan(0);
    expect(placeNameScore("Uşak Deri Organize Sanayi Bölgesi", "Uşak Deri OSB Bölge Müdürlüğü", ["Uşak"])).toBe(0);
    expect(placeNameScore("Forum İstanbul AVM", "Forum İstanbul", ["İstanbul", "Bayrampaşa"])).toBeGreaterThan(0);
    expect(placeNameScore("Kağıthane Anadolu Lisesi", "Kağıthane Anadolu İmam Hatip Lisesi", ["İstanbul", "Kağıthane"])).toBe(0);
    expect(placeNameScore("Kağıthane Anadolu Lisesi", "Kağıthane Anadolu Lisesi", ["İstanbul", "Kağıthane"])).toBe(1);
  });

  it("matches names made of kind and area words only with care", () => {
    const zeytinburnu = ["İstanbul", "Zeytinburnu"];
    expect(placeNameScore("Zeytinburnu Sahil Parkı", "Zeytinburnu Sahil Parkı", zeytinburnu)).toBe(1);
    // OSM names this one by its mahalle inside Zeytinburnu.
    expect(placeNameScore("Zeytinburnu Sahil Parkı", "Kazlıçeşme Sahil Parkı", zeytinburnu, ["Kazlıçeşme", "Zeytinburnu", "İstanbul"])).toBe(1);
    expect(placeNameScore("Zeytinburnu Sahil Parkı", "Kazlıçeşme Sahil Parkı", zeytinburnu, ["Kazlıçeşme", "Bakırköy", "İstanbul"])).toBe(0);
    expect(placeNameScore("Kağıthane Anadolu Lisesi", "Merkez Anadolu Lisesi", ["İstanbul", "Kağıthane"], ["Merkez Mahallesi", "Kağıthane", "İstanbul"])).toBe(0);
    expect(placeNameScore("Kağıthane Anadolu Lisesi", "Kağıthane Fen Lisesi", ["İstanbul", "Kağıthane"])).toBe(0);
    expect(placeNameScore("İnegöl Devlet Hastanesi", "T.C. Sağlık Bakanlığı İnegöl Devlet Hastanesi", ["Bursa", "İnegöl"])).toBeGreaterThan(0);
    expect(placeNameScore("Hatay'daki fabrika", "Özdemir Fabrikası", ["Hatay"])).toBe(0);
  });

  it("tells a name from a description", () => {
    expect(isPlaceName("yaya üst geçidi", ["Ankara"])).toBe(false);
    expect(isPlaceName("fabrika")).toBe(false);
    expect(isPlaceName("Hisar", ["Afyonkarahisar", "Hisar"])).toBe(false);
    expect(isPlaceName("Zeytinburnu Sahil Parkı", ["İstanbul", "Zeytinburnu"])).toBe(true);
    expect(isPlaceName("Forum İstanbul", ["İstanbul"])).toBe(true);
  });

  it("measures boxes", () => {
    expect(boxSizeKm({ west: 29.465, south: 38.612, east: 29.488, north: 38.63 })).toBeCloseTo(2.85, 1);
  });
});

describe("Nominatim in Türkiye", () => {
  it("reads a mahalle boundary as a neighborhood and an ilçe boundary as a district", () => {
    const mahalle = parsePlace({
      lat: "41.4572",
      lon: "31.7938",
      category: "boundary",
      type: "administrative",
      addresstype: "city_district",
      place_rank: 16,
      display_name: "Meşrutiyet Mahallesi, Zonguldak Merkez, Zonguldak",
      address: { city_district: "Meşrutiyet Mahallesi", city: "Zonguldak Merkez", province: "Zonguldak", country_code: "tr" },
    });
    expect(mahalle).toMatchObject({ precision: "neighborhood", neighborhood: "Meşrutiyet Mahallesi", district: "Zonguldak Merkez", province: "Zonguldak" });
    const ilce = parsePlace({ lat: "41.37", lon: "31.9", category: "boundary", type: "administrative", addresstype: "city", place_rank: 12, address: { city: "Zonguldak Merkez", province: "Zonguldak", country_code: "tr" } });
    expect(ilce?.precision).toBe("district");
  });

  it("keeps a street segment's geometry", () => {
    const segment = parsePlace({ lat: "41.04", lon: "29.0", category: "highway", type: "primary", addresstype: "road", geojson: { type: "LineString", coordinates: [[29.0, 41.04], [29.001, 41.041]] } });
    expect(segment?.lines).toEqual([[[29.0, 41.04], [29.001, 41.041]]]);
  });
});

describe("meetingPoints", () => {
  it("finds crossings, near misses and keeps far-apart meetings separate", () => {
    const horizontal: Array<[number, number]> = [[28.97, 41.08], [28.99, 41.08]];
    expect(meetingPoints([horizontal], [[[28.975, 41.07], [28.975, 41.09]]])[0]).toMatchObject({ distanceM: 0 });
    const gap = meetingPoints([horizontal], [[[28.975, 41.0806], [28.975, 41.09]]], { maxGapM: 90 })[0]!;
    expect(gap.distanceM).toBeGreaterThan(60);
    expect(gap.distanceM).toBeLessThan(70);
    expect(meetingPoints([horizontal], [[[28.975, 41.082], [28.975, 41.09]]])).toEqual([]);
    const twice = meetingPoints([horizontal], [[[28.972, 41.07], [28.972, 41.09]], [[28.988, 41.07], [28.988, 41.09]]]);
    expect(twice).toHaveLength(2);
  });
});

describe("Photon", () => {
  const feature = (properties: Record<string, unknown>, coordinates: [number, number] = [28.977, 41.0829]) => ({ geometry: { coordinates }, properties: { countrycode: "TR", ...properties } });

  it("treats schools, shops and buildings as exact points with their administrative areas", () => {
    expect(
      parsePhotonFeature(feature({ name: "Kağıthane Anadolu Lisesi", osm_key: "amenity", osm_value: "school", type: "house", district: "Merkez Mahallesi", county: "Kağıthane", state: "İstanbul" })),
    ).toMatchObject({ precision: "exact", province: "İstanbul", district: "Kağıthane", neighborhood: "Merkez Mahallesi", provider: "photon", kind: "amenity:school" });
  });

  it("maps roads, neighborhoods and industrial estates to their own precision", () => {
    expect(parsePhotonFeature(feature({ name: "Demir Sokak", osm_key: "highway", osm_value: "residential", type: "street" }))).toMatchObject({ precision: "street", street: "Demir Sokak" });
    expect(parsePhotonFeature(feature({ name: "Caferağa Mahallesi", osm_key: "place", osm_value: "neighbourhood", type: "district" }))?.precision).toBe("neighborhood");
    expect(parsePhotonFeature(feature({ name: "Uşak Deri OSB", osm_key: "landuse", osm_value: "industrial", type: "other" }))?.precision).toBe("neighborhood");
  });

  it("drops results outside Türkiye", () => {
    expect(parsePhotonFeature({ geometry: { coordinates: [23.72, 37.98] }, properties: { name: "Athens", countrycode: "GR" } })).toBeNull();
  });
});

describe("Overpass", () => {
  function client(elements: unknown[]) {
    const queries: string[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      queries.push(new URLSearchParams(String(init?.body)).get("data") ?? "");
      return Response.json({ elements });
    }) as typeof fetch;
    return { overpass: new OverpassClient({ baseUrl: "https://overpass.example/api/interpreter", userAgent: "test", minIntervalMs: 0, fetchImpl }), queries };
  }
  const box = { west: 28.95, south: 41.06, east: 29.0, north: 41.11 };

  it("merges the nodes of one junction and keeps distant junctions apart", async () => {
    const { overpass, queries } = client([
      { type: "node", id: 1, lat: 41.08, lon: 28.97 },
      { type: "node", id: 2, lat: 41.0801, lon: 28.9702 },
      { type: "node", id: 3, lat: 41.1, lon: 28.99 },
    ]);
    const result = await overpass.junction("Talatpaşa Caddesi", "Demir Sokak", box);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ precision: "exact", provider: "overpass", kind: "overpass:junction" });
    expect(result[0]!.latitude).toBeCloseTo(41.08005, 4);
    expect(queries[0]).toContain("node(w.a)(w.b)");
    expect(queries[0]).toContain("41.06000,28.95000,41.11000,29.00000");
  });

  it("returns the middle of a street and searches national roads by number", async () => {
    const { overpass, queries } = client([
      { type: "way", id: 1, center: { lat: 41.083, lon: 28.979 }, tags: { name: "Demir Sokağı" } },
      { type: "way", id: 2, center: { lat: 41.0834, lon: 28.9799 }, tags: { name: "Demir Sokağı" } },
    ]);
    const [street] = await overpass.street("Demir Sokak", box);
    expect(street).toMatchObject({ precision: "street", street: "Demir Sokağı" });
    await overpass.street("D-100", box);
    expect(queries[1]).toContain('["ref"~"(^|;) *D[ .-]?100( *;|$)",i]');
  });

  it("clusters nearby points", () => {
    const points = [
      { latitude: 41, longitude: 29 },
      { latitude: 41.001, longitude: 29.001 },
      { latitude: 41.1, longitude: 29.1 },
    ];
    expect(clusterPoints(points, 0.5).map((cluster) => cluster.length).sort()).toEqual([1, 2]);
  });
});
