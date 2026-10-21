/**
 * Runs the bot's location resolver on real-world samples against the live OSM services and prints what it found.
 * Use it after changing src/lib/bot/locate.ts or the geocoders (a few dozen requests, about one per second):
 *
 *   pnpm eval:locations
 */
import "./load-env";

import { locate } from "../src/lib/bot/locate";
import type { BotAnalysis } from "../src/lib/domain/types";
import { createGeocoder, createGeocoderClients, memoryCache } from "../src/lib/geo/geocoder";

type Location = BotAnalysis["location"];

const empty: Location = {
  mention: "",
  province: null,
  district: null,
  neighborhood: null,
  street: null,
  houseNumber: null,
  crossStreet: null,
  place: null,
  road: null,
  roadSection: null,
  precision: "unknown",
  confidence: 0.9,
  evidence: "",
};

/** What the model typically extracts from Turkish incident reports, including stories the bot really collected. */
export const SAMPLES: Array<{ name: string; location: Location }> = [
  { name: "Street in a district", location: { ...empty, mention: "Kağıthane Demir Sokak", province: "İstanbul", district: "Kağıthane", street: "Demir Sokak", precision: "street" } },
  { name: "Street in a neighborhood", location: { ...empty, mention: "Kadıköy Caferağa Mahallesi Moda Caddesi", province: "İstanbul", district: "Kadıköy", neighborhood: "Caferağa Mahallesi", street: "Moda Caddesi", precision: "street" } },
  { name: "Intersection", location: { ...empty, mention: "Barbaros Bulvarı ile Çırağan Caddesi'nin kesiştiği yer", province: "İstanbul", district: "Beşiktaş", street: "Barbaros Bulvarı", crossStreet: "Çırağan Caddesi", precision: "exact" } },
  { name: "Intersection in a neighborhood", location: { ...empty, mention: "Kadıköy Bahariye Caddesi ile Kadife Sokak'ın kesişimi", province: "İstanbul", district: "Kadıköy", neighborhood: "Caferağa Mahallesi", street: "Bahariye Caddesi", crossStreet: "Kadife Sokak", precision: "exact" } },
  { name: "House number", location: { ...empty, mention: "Beyoğlu İstiklal Caddesi No: 155", province: "İstanbul", district: "Beyoğlu", street: "İstiklal Caddesi", houseNumber: "155", precision: "exact" } },
  { name: "Named place (park)", location: { ...empty, mention: "Zeytinburnu Sahil Parkı", province: "İstanbul", district: "Zeytinburnu", place: "Zeytinburnu Sahil Parkı", precision: "exact" } },
  { name: "Named place (mall)", location: { ...empty, mention: "Bayrampaşa Forum İstanbul AVM", province: "İstanbul", district: "Bayrampaşa", place: "Forum İstanbul", precision: "exact" } },
  { name: "Industrial estate", location: { ...empty, mention: "Antakya Mobilyacıları İhtisas Sanayi Sitesi", province: "Hatay", district: "Antakya", place: "Antakya Mobilyacıları Sanayi Sitesi", precision: "street" } },
  { name: "Organized industrial zone", location: { ...empty, mention: "Uşak Deri Organize Sanayi Bölgesi", province: "Uşak", district: "Merkez", place: "Uşak Deri Organize Sanayi Bölgesi", precision: "neighborhood" } },
  { name: "Highway section", location: { ...empty, mention: "TEM Otoyolu Avcılar mevkii", province: "İstanbul", road: "TEM Otoyolu", roadSection: "Avcılar mevkii", precision: "street" } },
  { name: "National road by number", location: { ...empty, mention: "D-100 kara yolu Küçükçekmece mevkii", province: "İstanbul", road: "D-100", roadSection: "Küçükçekmece mevkii", precision: "street" } },
  { name: "Village road", location: { ...empty, mention: "Suvermez köyü yolu, Hisar köyü mevkii", province: "Afyonkarahisar", neighborhood: "Hisar Köyü", place: "Hisar Köyü mevkisi", street: "Suvermez Köyü yolu", precision: "neighborhood", confidence: 0.8 } },
  { name: "Central district neighborhood", location: { ...empty, mention: "Zonguldak Meşrutiyet Mahallesi", province: "Zonguldak", district: "Merkez", neighborhood: "Meşrutiyet Mahallesi", precision: "neighborhood" } },
  { name: "Town neighborhood", location: { ...empty, mention: "İnegöl Kemalpaşa Mahallesi", province: "Bursa", district: "İnegöl", neighborhood: "Kemalpaşa Mahallesi", precision: "neighborhood" } },
  { name: "Neighborhood in a big district", location: { ...empty, mention: "Sarıyer Kısırkaya", province: "İstanbul", district: "Sarıyer", neighborhood: "Kısırkaya", precision: "neighborhood" } },
  { name: "Numbered street (İzmir)", location: { ...empty, mention: "Konak Alsancak 1453 Sokak", province: "İzmir", district: "Konak", neighborhood: "Alsancak", street: "1453 Sokak", precision: "street" } },
  { name: "Province only", location: { ...empty, mention: "Eskişehir merkezli", province: "Eskişehir", precision: "city" } },
  { name: "Common mahalle, no district", location: { ...empty, mention: "İstanbul Cumhuriyet Mahallesi", province: "İstanbul", neighborhood: "Cumhuriyet Mahallesi", precision: "neighborhood" } },
  // Stories the bot collected, as the model read them.
  { name: "Numbered avenue (Ankara)", location: { ...empty, mention: "Erler Mahallesi 2453. Caddesi", province: "Ankara", neighborhood: "Erler", street: "2453. Caddesi", place: "yaya üst geçidi", precision: "street", confidence: 0.85 } },
  { name: "Estate with a long name", location: { ...empty, mention: "Antakya Mobilyacıları İhtisas Sanayi Sitesi", province: "Hatay", district: "Antakya", place: "Antakya Mobilyacıları İhtisas Sanayi Sitesi", precision: "street" } },
  { name: "Zone without a district", location: { ...empty, mention: "Uşak Tekstil Organize Sanayi Bölgesi", province: "Uşak", place: "Uşak Tekstil Organize Sanayi Bölgesi", precision: "city" } },
  { name: "Street missing from OSM", location: { ...empty, mention: "Merkez Meşrutiyet Mahallesi Sütliyen Sokak", province: "Zonguldak", district: "Merkez", neighborhood: "Meşrutiyet", street: "Sütliyen Sokak", precision: "street", confidence: 0.95 } },
];

async function main() {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const clients = createGeocoderClients({
    NOMINATIM_URL: process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org",
    PHOTON_URL: process.env.PHOTON_URL ?? "https://photon.komoot.io",
    OVERPASS_URL: process.env.OVERPASS_URL || undefined,
    GEOCODER_CONTACT_EMAIL: process.env.GEOCODER_CONTACT_EMAIL || undefined,
    APP_URL: appUrl,
  });
  const geocoder = createGeocoder(memoryCache(), clients);
  const only = process.argv.slice(2).join(" ").toLowerCase();
  for (const sample of SAMPLES.filter((entry) => !only || entry.name.toLowerCase().includes(only))) {
    const started = Date.now();
    try {
      const result = await locate(geocoder, sample.location);
      const where = result.geocode ? `${result.geocode.latitude.toFixed(5)},${result.geocode.longitude.toFixed(5)}` : "—";
      console.log(
        `${sample.name.padEnd(32)} ${String(result.method ?? "none").padEnd(12)} ${result.precision.padEnd(12)} ${where.padEnd(20)} ${String(result.queries).padStart(2)}q ${String(Date.now() - started).padStart(6)}ms  ${result.label}`,
      );
    } catch (error) {
      console.log(`${sample.name.padEnd(32)} error: ${(error as Error).message}`);
    }
  }
}

if (process.argv[1]?.endsWith("eval-locations.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
