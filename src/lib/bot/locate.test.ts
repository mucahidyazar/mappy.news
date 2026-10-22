import { describe, expect, it } from "vitest";

import type { BotAnalysis } from "@/lib/domain/types";
import type { Geocoder } from "@/lib/geo/geocoder";
import type { BoundingBox, GeocodeCandidate } from "@/lib/geo/types";

import { clueNames, locate, readParts, sameLocality, sameName, sameStreet } from "./locate";

type Location = BotAnalysis["location"];

const base: Location = {
  mention: "",
  province: "İstanbul",
  district: "Kağıthane",
  neighborhood: null,
  street: null,
  houseNumber: null,
  crossStreet: null,
  place: null,
  road: null,
  roadSection: null,
  precision: "street",
  confidence: 0.9,
  evidence: "",
};

const KAGITHANE: BoundingBox = { west: 28.95, south: 41.06, east: 29.0, north: 41.11 };
const MERKEZ_MAH: BoundingBox = { west: 28.97, south: 41.075, east: 28.985, north: 41.09 };

function candidate(overrides: Partial<GeocodeCandidate>): GeocodeCandidate {
  return {
    latitude: 41.08,
    longitude: 28.975,
    displayName: "Kağıthane, İstanbul",
    precision: "district",
    province: "İstanbul",
    district: "Kağıthane",
    neighborhood: null,
    street: null,
    provider: "nominatim",
    importance: 0.5,
    placeRank: 16,
    bbox: KAGITHANE,
    ...overrides,
  };
}

/** A geocoder that answers from a table and records what it was asked (and inside which box). */
function fakeGeocoder(answers: {
  search?: Record<string, GeocodeCandidate[]>;
  address?: GeocodeCandidate[];
  place?: GeocodeCandidate[];
  junction?: GeocodeCandidate[];
  streetLine?: GeocodeCandidate[];
  lines?: Record<string, GeocodeCandidate[]>;
  reverse?: GeocodeCandidate | null;
}) {
  const calls: Array<{ kind: string; query: string; bbox?: BoundingBox | null }> = [];
  const geocoder: Geocoder = {
    async search(query, options = {}) {
      calls.push({ kind: "search", query, bbox: options.bbox });
      return answers.search?.[query] ?? [];
    },
    async address(parts) {
      calls.push({ kind: "address", query: `${parts.street}|${parts.city}|${parts.state}` });
      return answers.address ?? [];
    },
    async place(query, options = {}) {
      calls.push({ kind: "place", query, bbox: options.bbox });
      return answers.place ?? [];
    },
    async junction(a, b, bbox) {
      calls.push({ kind: "junction", query: `${a}|${b}`, bbox });
      return answers.junction ?? [];
    },
    async streetLine(name, bbox) {
      calls.push({ kind: "streetLine", query: name, bbox });
      return answers.streetLine ?? [];
    },
    async lines(name, bbox) {
      calls.push({ kind: "lines", query: name, bbox });
      return answers.lines?.[name] ?? [];
    },
    async reverse() {
      calls.push({ kind: "reverse", query: "" });
      return answers.reverse ?? null;
    },
  };
  return { geocoder, calls };
}

const district = candidate({});
const merkezMahallesi = candidate({
  displayName: "Merkez Mahallesi, Kağıthane, İstanbul",
  precision: "neighborhood",
  neighborhood: "Merkez Mahallesi",
  latitude: 41.082,
  longitude: 28.978,
  bbox: MERKEZ_MAH,
});

describe("readParts", () => {
  it("expands abbreviations and drops the words OSM names don't carry", () => {
    const parts = readParts({
      ...base,
      district: "Merkez",
      province: "ZONGULDAK",
      neighborhood: "Hisar Köyü mevkisi",
      street: "Atatürk Cad.",
      houseNumber: "No: 12/A",
      place: "Moda Sahnesi önü",
    });
    expect(parts).toMatchObject({
      province: "Zonguldak",
      district: null,
      centralDistrict: true,
      neighborhood: "Hisar",
      street: "Atatürk Caddesi",
      houseNumber: "12/A",
      place: "Moda Sahnesi",
    });
  });

  it("reads analyses stored before the detailed address fields existed", () => {
    const { houseNumber: _h, crossStreet: _c, road: _r, roadSection: _s, ...legacy } = base;
    expect(readParts(legacy as Location)).toMatchObject({ houseNumber: null, crossStreet: null, road: null, roadSection: null });
  });
});

describe("name matching", () => {
  it("treats Turkish spellings and administrative words as the same place", () => {
    expect(sameName("Kâğıthane", "Kağıthane")).toBe(true);
    expect(sameName("Kemalpaşa Mahallesi", "Kemalpaşa")).toBe(true);
    expect(sameName("Kadıköy", "Üsküdar")).toBe(false);
    expect(sameStreet("Demir Sokağı", "Demir Sokak")).toBe(true);
    expect(sameStreet("Bağdat Cd.", "Bağdat Caddesi")).toBe(true);
    expect(sameStreet("Demir Sokak", "Demirci Sokak")).toBe(false);
    expect(sameStreet("Hoca Ahmed Yesevi Caddesi", "Hoca Ahmet Yesevi Cad.")).toBe(true);
    expect(sameStreet("Antalya - Burdur Yolu", "Antalya-Burdur Yolu")).toBe(true);
  });

  it("matches a mahalle only by its own name", () => {
    expect(sameLocality("Kemalpaşa Mahallesi", "Kemalpaşa")).toBe(true);
    expect(sameLocality("Piri Reis Mahallesi", "Pirireis")).toBe(true);
    expect(sameLocality("Oğuzhan Mermer", "Oğuzhan")).toBe(false);
  });
});

describe("locate", () => {
  it("finds a street inside the neighborhood's box and names the mahalle", async () => {
    const stretch = candidate({ displayName: "Demir Sokak, Merkez Mahallesi, Kağıthane", precision: "street", street: "Demir Sokak", latitude: 41.0831, longitude: 28.9793, bbox: null });
    const { geocoder, calls } = fakeGeocoder({
      search: {
        "Kağıthane, İstanbul": [district],
        "Merkez Mahallesi, Kağıthane, İstanbul": [merkezMahallesi],
        "Demir Sokak": [stretch],
      },
    });
    const result = await locate(geocoder, { ...base, neighborhood: "Merkez Mahallesi", street: "Demir Sokak" });
    expect(result).toMatchObject({
      method: "street",
      precision: "street",
      label: "Demir Sokak, Merkez Mahallesi, Kağıthane, İstanbul",
      geocode: { latitude: 41.0831, longitude: 28.9793, district: "Kağıthane", province: "İstanbul", method: "street" },
    });
    // Every street-level question stays inside the neighborhood.
    const streetCall = calls.find((call) => call.kind === "search" && call.query === "Demir Sokak");
    expect(streetCall?.bbox?.west).toBeGreaterThan(MERKEZ_MAH.west - 0.01);
    expect(streetCall?.bbox?.east).toBeLessThan(MERKEZ_MAH.east + 0.01);
  });

  it("pins a house number to the building", async () => {
    const building = candidate({ precision: "exact", street: "Demir Sokak", latitude: 41.0835, longitude: 28.9801, displayName: "12, Demir Sokak, Kağıthane" });
    const { geocoder, calls } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district] }, address: [building], reverse: candidate({ neighborhood: "Merkez Mahallesi" }) });
    const result = await locate(geocoder, { ...base, street: "Demir Sk.", houseNumber: "12" });
    expect(result).toMatchObject({ method: "address", precision: "exact", confidence: 0.87, label: "Demir Sokak, Merkez Mahallesi, Kağıthane, İstanbul" });
    expect(calls.find((call) => call.kind === "address")?.query).toBe("12 Demir Sokak|Kağıthane|İstanbul");
  });

  it("puts an intersection on the node both streets share", async () => {
    const node = candidate({ precision: "exact", provider: "overpass", latitude: 41.084, longitude: 28.977, district: null, province: null, bbox: null });
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district] }, junction: [node], reverse: null });
    const result = await locate(geocoder, { ...base, street: "Talatpaşa Caddesi", crossStreet: "Demir Sokak" });
    expect(result).toMatchObject({ method: "junction", precision: "exact", label: "Talatpaşa Caddesi / Demir Sokak, Kağıthane, İstanbul" });
  });

  it("leaves an intersection that exists twice in the district unpinned", async () => {
    const one = candidate({ precision: "exact", provider: "overpass", latitude: 41.07, longitude: 28.96 });
    const two = candidate({ precision: "exact", provider: "overpass", latitude: 41.1, longitude: 28.99 });
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district] }, junction: [one, two] });
    expect(await locate(geocoder, { ...base, street: "Atatürk Caddesi", crossStreet: "Cumhuriyet Caddesi" })).toMatchObject({ method: "district", precision: "district" });
  });

  it("finds a named place with Photon and prefers it to the street around it", async () => {
    const school = candidate({ provider: "photon", precision: "exact", displayName: "Kağıthane Anadolu Lisesi, Merkez Mahallesi, Kağıthane", latitude: 41.0829, longitude: 28.9771, bbox: null });
    const stretch = candidate({ precision: "street", street: "Demir Sokak", displayName: "Demir Sokak", latitude: 41.0831, longitude: 28.9793 });
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district], "Demir Sokak": [stretch] }, place: [school], reverse: candidate({ neighborhood: "Merkez Mahallesi" }) });
    const result = await locate(geocoder, { ...base, street: "Demir Sokak", place: "Kağıthane Anadolu Lisesi" });
    expect(result).toMatchObject({ method: "place", precision: "exact", label: "Kağıthane Anadolu Lisesi, Merkez Mahallesi, Kağıthane, İstanbul" });
  });

  it("ignores places whose name doesn't match", async () => {
    const other = candidate({ provider: "photon", precision: "exact", displayName: "Migros, Kağıthane" });
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district] }, place: [other] });
    expect(await locate(geocoder, { ...base, place: "Kağıthane Anadolu Lisesi" })).toMatchObject({ method: "district" });
  });

  it("does not take a pharmacy in some industrial estate for the estate the story names", async () => {
    const antakya = candidate({ province: "Hatay", district: "Antakya", displayName: "Antakya, Hatay", latitude: 36.2, longitude: 36.16, bbox: { west: 36.0, south: 36.05, east: 36.35, north: 36.4 } });
    const pharmacy = candidate({ provider: "photon", precision: "exact", name: "Yeni Sanayi Sitesi Eczanesi", displayName: "Yeni Sanayi Sitesi Eczanesi, Güzelburç, Antakya, Hatay", latitude: 36.238, longitude: 36.181, bbox: null });
    const { geocoder } = fakeGeocoder({ search: { "Antakya, Hatay": [antakya] }, place: [pharmacy] });
    const result = await locate(geocoder, { ...base, province: "Hatay", district: "Antakya", place: "Antakya Mobilyacıları İhtisas Sanayi Sitesi" });
    expect(result).toMatchObject({ method: "district", precision: "district", label: "Antakya, Hatay" });
  });

  it("does not pick one of several same-named shops", async () => {
    const shop = (latitude: number, longitude: number) => candidate({ provider: "photon", precision: "exact", kind: "shop:supermarket", name: "BİM", displayName: "BİM, Kağıthane", latitude, longitude, bbox: null });
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district] }, place: [shop(41.07, 28.96), shop(41.1, 28.99)] });
    expect(await locate(geocoder, { ...base, place: "BİM" })).toMatchObject({ method: "district" });
  });

  it("gives a large named area the precision of its size", async () => {
    const usak = candidate({ precision: "city", province: "Uşak", district: null, displayName: "Uşak", latitude: 38.68, longitude: 29.41, bbox: { west: 28.9, south: 38.3, east: 30.0, north: 39.2 } });
    const zone = candidate({
      provider: "photon",
      precision: "neighborhood",
      kind: "landuse:industrial",
      name: "Uşak Deri (Karma) OSB",
      displayName: "Uşak Deri (Karma) OSB, Uşak",
      province: "Uşak",
      district: "Uşak Merkez",
      latitude: 38.6208,
      longitude: 29.4765,
      bbox: { west: 29.466, south: 38.614, east: 29.484, north: 38.627 },
    });
    const office = candidate({ provider: "photon", precision: "exact", kind: "office:company", name: "Uşak Deri OSB Bölge Müdürlüğü", displayName: "Uşak Deri OSB Bölge Müdürlüğü, Uşak", latitude: 38.625, longitude: 29.47, bbox: null });
    const { geocoder } = fakeGeocoder({ search: { Uşak: [usak] }, place: [office, zone] });
    const result = await locate(geocoder, { ...base, province: "Uşak", district: null, place: "Uşak Deri Organize Sanayi Bölgesi" });
    // The zone itself, not its management office; about 2 km across, so no more precise than a neighborhood.
    expect(result).toMatchObject({ method: "place", precision: "neighborhood", label: "Uşak Deri Organize Sanayi Bölgesi, Uşak" });
    expect(result.geocode).toMatchObject({ latitude: 38.6208, district: null });
  });

  it("names the ilçe the mahalle is in when the story gives only the province", async () => {
    const ankara = candidate({ precision: "city", province: "Ankara", district: null, displayName: "Ankara", latitude: 39.92, longitude: 32.85, bbox: { west: 31.0, south: 38.6, east: 34.2, north: 40.9 } });
    const erler = candidate({ precision: "neighborhood", province: "Ankara", district: "Etimesgut", neighborhood: "Erler Mahallesi", displayName: "Erler Mahallesi, Etimesgut, Ankara", latitude: 39.96, longitude: 32.63, bbox: { west: 32.6, south: 39.94, east: 32.66, north: 39.98 } });
    const avenue = candidate({ precision: "street", province: "Ankara", district: "Etimesgut", street: "2453. Cadde", displayName: "2453. Cadde, Erler Mahallesi, Etimesgut, Ankara", latitude: 39.961, longitude: 32.632, bbox: null });
    const { geocoder, calls } = fakeGeocoder({ search: { Ankara: [ankara], "Erler, Ankara": [erler], "2453. Cadde": [avenue] } });
    const result = await locate(geocoder, { ...base, province: "Ankara", district: null, neighborhood: "Erler", street: "2453. Caddesi" });
    expect(result).toMatchObject({ method: "street", label: "2453. Caddesi, Erler Mahallesi, Etimesgut, Ankara", geocode: { district: "Etimesgut" } });
    // Numbered streets are searched both ways and never by the bare number.
    expect(calls.map((call) => call.query)).toEqual(expect.arrayContaining(["2453. Caddesi", "2453. Cadde"]));
    expect(calls.map((call) => call.query)).not.toContain("2453.");
    expect(calls.map((call) => call.query)).not.toContain("2453");
  });

  it("picks the same-named village next to the other place the story names", async () => {
    const afyon = candidate({ precision: "city", province: "Afyonkarahisar", district: null, displayName: "Afyonkarahisar", latitude: 38.75, longitude: 30.54, bbox: { west: 29.7, south: 37.7, east: 31.7, north: 39.3 } });
    const emirdag = candidate({ precision: "neighborhood", kind: "place:suburb", province: "Afyonkarahisar", district: "Emirdağ", neighborhood: "Hisar", displayName: "Hisar, Emirdağ, Afyonkarahisar", latitude: 39.0209, longitude: 31.2944, bbox: null });
    const bolvadin = candidate({ precision: "neighborhood", kind: "boundary:administrative", province: "Afyonkarahisar", district: "Bolvadin", neighborhood: "Hisar Mahallesi", displayName: "Hisar Mahallesi, Bolvadin, Afyonkarahisar", latitude: 38.7155, longitude: 31.0487, bbox: { west: 31.04, south: 38.71, east: 31.06, north: 38.72 } });
    const suvermez = candidate({ precision: "neighborhood", province: "Afyonkarahisar", district: "Emirdağ", neighborhood: null, displayName: "Suvermez, Emirdağ, Afyonkarahisar", latitude: 39.0285, longitude: 31.2242, bbox: null });
    const { geocoder } = fakeGeocoder({ search: { Afyonkarahisar: [afyon], "Hisar, Afyonkarahisar": [emirdag, bolvadin], "Suvermez, Afyonkarahisar": [suvermez] } });
    const result = await locate(geocoder, { ...base, province: "Afyonkarahisar", district: null, neighborhood: "Hisar Köyü", street: "Suvermez Köyü yolu", precision: "neighborhood" });
    expect(result).toMatchObject({ method: "neighborhood", label: "Hisar, Emirdağ, Afyonkarahisar", geocode: { latitude: 39.0209 } });
  });

  it("does not guess which of several same-named mahalles a story means", async () => {
    const istanbul = candidate({ precision: "city", district: null, displayName: "İstanbul", latitude: 41.0, longitude: 28.95, bbox: { west: 27.9, south: 40.8, east: 29.9, north: 41.6 } });
    const esenyurt = candidate({ precision: "neighborhood", district: "Esenyurt", neighborhood: "Cumhuriyet Mahallesi", displayName: "Cumhuriyet Mahallesi, Esenyurt, İstanbul", latitude: 41.03, longitude: 28.67 });
    const sisli = candidate({ precision: "neighborhood", district: "Şişli", neighborhood: "Cumhuriyet Mahallesi", displayName: "Cumhuriyet Mahallesi, Şişli, İstanbul", latitude: 41.05, longitude: 28.98 });
    const { geocoder } = fakeGeocoder({ search: { İstanbul: [istanbul], "Cumhuriyet Mahallesi, İstanbul": [esenyurt, sisli] } });
    const result = await locate(geocoder, { ...base, district: null, neighborhood: "Cumhuriyet Mahallesi", precision: "neighborhood" });
    expect(result).toMatchObject({ method: "city", precision: "city", label: "Cumhuriyet Mahallesi, İstanbul" });
  });

  it("keeps to the named district when the same mahalle name lies just across its border", async () => {
    const sisli = candidate({ precision: "neighborhood", district: "Şişli", neighborhood: "Merkez Mahallesi", displayName: "Merkez Mahallesi, Şişli, İstanbul", latitude: 41.06, longitude: 28.99 });
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district], "Merkez Mahallesi, Kağıthane, İstanbul": [sisli, merkezMahallesi] } });
    const result = await locate(geocoder, { ...base, neighborhood: "Merkez Mahallesi", precision: "neighborhood" });
    expect(result).toMatchObject({ method: "neighborhood", label: "Merkez Mahallesi, Kağıthane, İstanbul", geocode: { latitude: 41.082 } });
  });

  it("reads the other places a story names", () => {
    expect(clueNames(readParts({ ...base, neighborhood: "Hisar Köyü", street: "Suvermez Köyü yolu", place: "Hisar Köyü mevkisi" }))).toEqual(["Suvermez"]);
    expect(clueNames(readParts({ ...base, road: "Emirdağ-Afyon yolu" }))).toEqual(["Emirdağ", "Afyon"]);
    expect(clueNames(readParts({ ...base, street: "Atatürk Caddesi", roadSection: "Avcılar mevkii" }))).toEqual(["Avcılar"]);
  });

  it("does not take a business named after the mahalle for the mahalle", async () => {
    const bucak = candidate({ province: "Burdur", district: "Bucak", displayName: "Bucak, Burdur", latitude: 37.457, longitude: 30.586, bbox: { west: 30.4, south: 37.3, east: 30.8, north: 37.6 } });
    const quarry = candidate({ precision: "neighborhood", kind: "landuse:industrial", name: "Oğuzhan Mermer", province: "Burdur", district: "Bucak", displayName: "Oğuzhan Mermer, Bucak, Burdur", latitude: 37.4777, longitude: 30.5669 });
    const { geocoder } = fakeGeocoder({ search: { "Bucak, Burdur": [bucak], "Oğuzhan, Bucak, Burdur": [quarry], "Oğuzhan Mahallesi, Bucak, Burdur": [quarry] } });
    const result = await locate(geocoder, { ...base, province: "Burdur", district: "Bucak", neighborhood: "Oğuzhan Mahallesi", precision: "neighborhood" });
    expect(result).toMatchObject({ method: "district", label: "Oğuzhan Mahallesi, Bucak, Burdur" });
  });

  it("finds a street that OSM spells another way through Photon", async () => {
    const avenue = candidate({ provider: "photon", precision: "street", kind: "highway:secondary", name: "Hoca Ahmed Yesevi Caddesi", street: "Hoca Ahmed Yesevi Caddesi", neighborhood: "Konak Mahallesi", displayName: "Hoca Ahmed Yesevi Caddesi, Konak Mahallesi, Kağıthane", latitude: 41.08, longitude: 28.975, bbox: null });
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district] }, place: [avenue] });
    delete geocoder.streetLine;
    expect(await locate(geocoder, { ...base, street: "Hoca Ahmet Yesevi Caddesi" })).toMatchObject({
      method: "street",
      precision: "street",
      label: "Hoca Ahmet Yesevi Caddesi, Konak Mahallesi, Kağıthane, İstanbul",
    });
  });

  it("does not take a business named like the street for the street", async () => {
    const office = candidate({ precision: "exact", kind: "office:consulting", name: "Kazlıçeşme", street: "OSB 12. Yol Sokak", displayName: "Kazlıçeşme, OSB 12. Yol Sk., Tuzla", latitude: 41.07, longitude: 28.96, bbox: null });
    const avenue = candidate({ precision: "street", kind: "highway:tertiary", name: "Kazlıçeşme Cd.", street: "Kazlıçeşme Cd.", displayName: "Kazlıçeşme Cd., Aydınlı Mahallesi, Tuzla", latitude: 41.1, longitude: 28.99, bbox: null });
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district], Kazlıçeşme: [office, avenue] }, reverse: candidate({ neighborhood: "Aydınlı Mahallesi" }) });
    expect(await locate(geocoder, { ...base, street: "Kazlıçeşme Caddesi" })).toMatchObject({ method: "street", geocode: { latitude: 41.1 } });
  });

  it("takes the named parts of an industrial zone for the zone", async () => {
    const zone = candidate({ provider: "photon", precision: "neighborhood", kind: "landuse:industrial", name: "İstanbul Deri Organize Sanayi Bölgesi", latitude: 41.08, longitude: 28.975, bbox: { west: 28.96, south: 41.07, east: 28.99, north: 41.09 } });
    const part = candidate({ provider: "photon", precision: "neighborhood", kind: "landuse:industrial", name: "Organize Deri Sanayi", latitude: 41.088, longitude: 28.985, bbox: null });
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district] }, place: [part, zone] });
    expect(await locate(geocoder, { ...base, place: "Kağıthane Deri Organize Sanayi Bölgesi" })).toMatchObject({ method: "place", geocode: { latitude: 41.08 } });
  });

  it("looks for a belde's villages around it, not inside its dot of a box", async () => {
    const kozcagiz = candidate({ precision: "neighborhood", kind: "place:village", province: "Bartın", district: "Bartın Merkez", displayName: "Kozcağız, Bartın Merkez, Bartın", latitude: 41.4779, longitude: 32.3404, bbox: { west: 32.33, south: 41.47, east: 32.35, north: 41.49 } });
    const ustaoglu = candidate({ precision: "neighborhood", kind: "place:village", province: "Bartın", district: "Bartın Merkez", displayName: "Ustaoğlu, Bartın Merkez, Bartın", latitude: 41.44, longitude: 32.38, bbox: null });
    const { geocoder, calls } = fakeGeocoder({ search: { "Kozcağız, Bartın": [kozcagiz], "Ustaoğlu, Bartın": [ustaoglu] } });
    const result = await locate(geocoder, { ...base, province: "Bartın", district: "Kozcağız", neighborhood: "Ustaoğlu Köyü", precision: "neighborhood" });
    expect(result).toMatchObject({ method: "neighborhood", label: "Ustaoğlu, Kozcağız, Bartın", geocode: { latitude: 41.44 } });
    const box = calls.find((call) => call.query === "Ustaoğlu, Bartın")?.bbox;
    expect(box!.north - box!.south).toBeGreaterThan(0.1);
  });

  it("puts a crash in a small road section at street level", async () => {
    const province = candidate({ precision: "city", district: null, displayName: "İstanbul", latitude: 41.0, longitude: 28.95, bbox: { west: 27.9, south: 40.8, east: 29.9, north: 41.6 } });
    const kavak = candidate({ precision: "neighborhood", district: "Beykoz", name: "Anadolukavağı", displayName: "Anadolukavağı, Beykoz, İstanbul", latitude: 41.17, longitude: 29.09, bbox: { west: 29.088, south: 41.168, east: 29.092, north: 41.172 } });
    const road = candidate({ precision: "street", kind: "highway:primary", street: "Anadolu Kavağı Yolu", displayName: "Anadolu Kavağı Yolu", latitude: 41.1702, longitude: 29.0901, bbox: null });
    const { geocoder } = fakeGeocoder({ search: { İstanbul: [province], "Anadolukavağı, İstanbul": [kavak], "Anadolu Kavağı Yolu": [road] }, reverse: candidate({ neighborhood: "Anadolukavağı Mahallesi" }) });
    delete geocoder.streetLine;
    expect(await locate(geocoder, { ...base, district: null, road: "Anadolu Kavağı Yolu", roadSection: "Anadolukavağı mevkii" })).toMatchObject({ method: "road", precision: "street" });
  });

  it("does not guess between same-named streets in different parts of the district", async () => {
    const north = candidate({ precision: "street", street: "Atatürk Caddesi", latitude: 41.105, longitude: 28.99 });
    const south = candidate({ precision: "street", street: "Atatürk Caddesi", latitude: 41.065, longitude: 28.955 });
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district], "Atatürk Caddesi": [north, south] } });
    expect(await locate(geocoder, { ...base, street: "Atatürk Caddesi" })).toMatchObject({ method: "district", precision: "district" });
  });

  it("falls back to OSM street geometry when Nominatim doesn't know the spelling", async () => {
    const line = candidate({ provider: "overpass", precision: "street", street: "Demir Sokağı", latitude: 41.083, longitude: 28.979 });
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district], "Merkez Mahallesi, Kağıthane, İstanbul": [merkezMahallesi] }, streetLine: [line] });
    const result = await locate(geocoder, { ...base, neighborhood: "Merkez Mahallesi", street: "Demir Sokak" });
    expect(result).toMatchObject({ method: "street", precision: "street", geocode: { provider: "overpass" } });
  });

  it("places a highway crash on the road inside the named section", async () => {
    const avcilar = candidate({ district: "Avcılar", displayName: "Avcılar, İstanbul", latitude: 40.98, longitude: 28.72, bbox: { west: 28.67, south: 40.96, east: 28.76, north: 41.02 } });
    const province = candidate({ precision: "city", district: null, displayName: "İstanbul", latitude: 41.0, longitude: 28.95, bbox: { west: 27.9, south: 40.8, east: 29.9, north: 41.6 } });
    const road = candidate({ provider: "overpass", precision: "street", street: "TEM Otoyolu", latitude: 40.995, longitude: 28.71, district: null, province: null, bbox: null });
    const { geocoder, calls } = fakeGeocoder({ search: { İstanbul: [province], "Avcılar, İstanbul": [avcilar] }, streetLine: [road], reverse: candidate({ neighborhood: "Firuzköy" }) });
    const result = await locate(geocoder, { ...base, district: null, road: "TEM Otoyolu", roadSection: "Avcılar mevkii", precision: "street" });
    // Kilometers of motorway run through Avcılar: on the road, but only as precise as the district, so the label
    // doesn't name the mahalle the point happens to fall in.
    expect(result).toMatchObject({ method: "road", precision: "district", label: "TEM Otoyolu, Avcılar, İstanbul", geocode: { district: "Avcılar" } });
    const roadCall = calls.find((call) => call.kind === "streetLine");
    expect(roadCall?.bbox?.west).toBeGreaterThan(28.6);
  });

  it("searches the city itself for stories in a central district", async () => {
    const zonguldak = candidate({ precision: "city", district: null, province: "Zonguldak", displayName: "Zonguldak", latitude: 41.45, longitude: 31.79, bbox: { west: 31.2, south: 40.9, east: 32.4, north: 41.7 } });
    const mesrutiyet = candidate({ precision: "neighborhood", province: "Zonguldak", district: null, neighborhood: "Meşrutiyet Mahallesi", displayName: "Meşrutiyet Mahallesi, Zonguldak", latitude: 41.452, longitude: 31.792, bbox: null });
    const { geocoder, calls } = fakeGeocoder({ search: { Zonguldak: [zonguldak], "Meşrutiyet, Zonguldak": [mesrutiyet] } });
    const result = await locate(geocoder, { ...base, province: "Zonguldak", district: "Merkez", neighborhood: "Meşrutiyet", precision: "neighborhood" });
    expect(result).toMatchObject({ method: "neighborhood", precision: "neighborhood", label: "Meşrutiyet Mahallesi, Zonguldak" });
    // Not the whole province: a box around the city.
    const box = calls.find((call) => call.query === "Meşrutiyet, Zonguldak")?.bbox;
    expect(box!.east - box!.west).toBeLessThan(0.4);
  });

  it("keeps uncertain readings at area level", async () => {
    const stretch = candidate({ precision: "street", street: "Demir Sokak", latitude: 41.0831, longitude: 28.9793 });
    const { geocoder, calls } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district], "Demir Sokak": [stretch] } });
    expect(await locate(geocoder, { ...base, street: "Demir Sokak", confidence: 0.3 })).toMatchObject({ method: "district", confidence: 0.29 });
    expect(calls.some((call) => call.query === "Demir Sokak")).toBe(false);
  });

  it("survives a failing service and keeps what the others found", async () => {
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district], "Merkez Mahallesi, Kağıthane, İstanbul": [merkezMahallesi] } });
    geocoder.junction = async () => {
      throw new Error("Overpass is busy (504)");
    };
    const result = await locate(geocoder, { ...base, neighborhood: "Merkez", street: "Demir Sokak", crossStreet: "Talatpaşa Caddesi" });
    expect(result).toMatchObject({ method: "neighborhood", precision: "neighborhood" });
  });

  it("intersects the streets' geometry when no Overpass is configured", async () => {
    const segment = (street: string, line: Array<[number, number]>) => candidate({ precision: "street", street, displayName: street, lines: [line], bbox: null });
    const { geocoder } = fakeGeocoder({
      search: { "Kağıthane, İstanbul": [district] },
      lines: {
        "Talatpaşa Caddesi": [segment("Talatpaşa Caddesi", [[28.97, 41.08], [28.98, 41.08]])],
        "Demir Sokak": [segment("Demir Sokak", [[28.975, 41.075], [28.975, 41.085]])],
      },
      reverse: candidate({ neighborhood: "Merkez Mahallesi" }),
    });
    delete geocoder.junction;
    const result = await locate(geocoder, { ...base, street: "Talatpaşa Caddesi", crossStreet: "Demir Sokak" });
    expect(result).toMatchObject({ method: "junction", precision: "exact" });
    expect(result.geocode!.latitude).toBeCloseTo(41.08, 5);
    expect(result.geocode!.longitude).toBeCloseTo(28.975, 5);
  });

  it("calls a near miss between two streets their corner, not the exact junction", async () => {
    const segment = (street: string, line: Array<[number, number]>) => candidate({ precision: "street", street, displayName: street, lines: [line], bbox: null });
    const { geocoder } = fakeGeocoder({
      search: { "Kağıthane, İstanbul": [district] },
      lines: {
        "Talatpaşa Caddesi": [segment("Talatpaşa Caddesi", [[28.97, 41.08], [28.98, 41.08]])],
        // Ends about 70 m short of Talatpaşa Caddesi.
        "Demir Sokak": [segment("Demir Sokak", [[28.975, 41.0806], [28.975, 41.09]])],
      },
    });
    delete geocoder.junction;
    expect(await locate(geocoder, { ...base, street: "Talatpaşa Caddesi", crossStreet: "Demir Sokak" })).toMatchObject({ method: "junction", precision: "street" });
  });

  it("finds a street that OSM spells differently by its name alone", async () => {
    const stretch = candidate({ precision: "street", street: "Demir Sokağı", displayName: "Demir Sokağı, Harmantepe Mahallesi", latitude: 41.0793, longitude: 28.9888, bbox: null });
    const { geocoder } = fakeGeocoder({ search: { "Kağıthane, İstanbul": [district], Demir: [stretch] }, reverse: candidate({ neighborhood: "Harmantepe Mahallesi" }) });
    expect(await locate(geocoder, { ...base, street: "Demir Sokak" })).toMatchObject({ method: "street", label: "Demir Sokak, Harmantepe Mahallesi, Kağıthane, İstanbul" });
  });

  it("knows the TEM by its OSM name", async () => {
    const province = candidate({ precision: "city", district: null, displayName: "İstanbul", latitude: 41.0, longitude: 28.95, bbox: { west: 27.9, south: 40.8, east: 29.9, north: 41.6 } });
    const avcilar = candidate({ district: "Avcılar", displayName: "Avcılar, İstanbul", latitude: 41.0, longitude: 28.72, bbox: { west: 28.68, south: 40.97, east: 28.76, north: 41.11 } });
    const motorway = candidate({ precision: "street", street: "Avrupa Otoyolu", displayName: "Avrupa Otoyolu", kind: "highway:motorway", latitude: 41.0568, longitude: 28.731, district: "Avcılar", bbox: null });
    const { geocoder, calls } = fakeGeocoder({ search: { İstanbul: [province], "Avcılar, İstanbul": [avcilar], "Avrupa Otoyolu": [motorway] }, reverse: candidate({ neighborhood: "Tahtakale Mahallesi" }) });
    delete geocoder.streetLine;
    const result = await locate(geocoder, { ...base, district: null, road: "TEM Otoyolu", roadSection: "Avcılar mevkii" });
    expect(result).toMatchObject({ method: "road", precision: "district", label: "TEM Otoyolu, Avcılar, İstanbul" });
    expect(calls.map((call) => call.query)).toContain("Avrupa Otoyolu");
  });

  it("finds a central district by its OSM name", async () => {
    const merkez = candidate({ precision: "district", province: "Zonguldak", district: "Zonguldak Merkez", displayName: "Zonguldak Merkez, Zonguldak", latitude: 41.37, longitude: 31.9, bbox: { west: 31.75, south: 41.26, east: 32.07, north: 41.48 } });
    const mesrutiyet = candidate({ precision: "neighborhood", province: "Zonguldak", neighborhood: "Meşrutiyet Mahallesi", displayName: "Meşrutiyet Mahallesi, Zonguldak Merkez, Zonguldak", latitude: 41.4572, longitude: 31.7938, bbox: null });
    const { geocoder } = fakeGeocoder({ search: { "Zonguldak Merkez, Zonguldak": [merkez], "Meşrutiyet Mahallesi, Zonguldak": [mesrutiyet] } });
    const result = await locate(geocoder, { ...base, province: "Zonguldak", district: "Merkez", neighborhood: "Meşrutiyet Mahallesi" });
    expect(result).toMatchObject({ method: "neighborhood", label: "Meşrutiyet Mahallesi, Zonguldak" });
    expect(result.geocode!.latitude).toBeCloseTo(41.4572, 4);
  });

  it("uses the mention when the model named no district or province", async () => {
    const goreme = candidate({ precision: "district", province: "Nevşehir", district: "Göreme", displayName: "Göreme, Nevşehir" });
    const { geocoder } = fakeGeocoder({ search: { Göreme: [goreme] } });
    const result = await locate(geocoder, { ...base, province: null, district: null, mention: "Göreme", precision: "district" });
    expect(result).toMatchObject({ method: "mention", precision: "district" });
    expect((await locate(fakeGeocoder({}).geocoder, { ...base, province: null, district: null, mention: "" })).geocode).toBeNull();
  });
});
