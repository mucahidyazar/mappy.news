import type { LocationPrecision } from "@/lib/domain/constants";
import { formatLocationLabel, isMorePrecise } from "@/lib/domain/location";
import { foldTurkish } from "@/lib/domain/text";
import type { BotAnalysis, GeocodeResult } from "@/lib/domain/types";
import type { Geocoder } from "@/lib/geo/geocoder";
import type { GeocodeCandidate } from "@/lib/geo/nominatim";

export interface GeocodeQuery {
  query: string;
  level: LocationPrecision;
}

const MAX_QUERIES = 3;

function join(...parts: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => {
      if (!part) return false;
      const key = foldTurkish(part);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

/** OSM names villages and localities without these words ("Hisar", not "Hisar Köyü mevkisi"). */
function placeName(value: string | null) {
  return value?.replace(/\s+(köyü|köy|mevkii|mevkisi|mevki|civarı|yakınları)(?=$|[\s,.;])/giu, "").trim() || null;
}

/**
 * Nominatim queries from most to least specific; low-confidence locations skip street-level guesses. At most
 * {@link MAX_QUERIES} are sent, and the last of them is always the district or province, so a story that names a
 * place still lands on the map when its village or street is unknown to OSM.
 */
/** "Merkez" is every province's central district; OSM knows it by the city's name, so it is left out of queries. */
function namedDistrict(district: string | null) {
  return district && !/(^|\s)merkez$/.test(foldTurkish(district.trim())) ? district : null;
}

export function geocodeQueries(location: BotAnalysis["location"]): GeocodeQuery[] {
  const { street, province } = location;
  const district = namedDistrict(location.district);
  const place = placeName(location.place);
  const neighborhood = placeName(location.neighborhood);
  const precise = location.confidence >= 0.5;
  const specific: GeocodeQuery[] = [];
  if (precise && place && (district || province)) specific.push({ query: join(place, district, province), level: "street" });
  if (precise && street && (district || province)) specific.push({ query: join(street, neighborhood, district, province), level: "street" });
  if (neighborhood && (district || province)) specific.push({ query: join(neighborhood, district, province), level: "neighborhood" });
  const coarse: GeocodeQuery[] = [];
  if (district) coarse.push({ query: join(district, province), level: "district" });
  if (province) coarse.push({ query: join(province), level: "city" });

  const unique = (items: GeocodeQuery[]) => {
    const seen = new Map<string, GeocodeQuery>();
    for (const item of items) if (item.query && !seen.has(item.query)) seen.set(item.query, item);
    return [...seen.values()];
  };
  const all = unique([...specific, ...coarse]);
  if (all.length <= MAX_QUERIES) return all;
  const fallback = coarse[0]!;
  return [...unique(specific).filter((item) => item.query !== fallback.query).slice(0, MAX_QUERIES - 1), fallback];
}

function sameName(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  const left = foldTurkish(a).replace(/\s+(ili|ilcesi|merkez)$/, "");
  const right = foldTurkish(b).replace(/\s+(ili|ilcesi|merkez)$/, "");
  return left === right || left.includes(right) || right.includes(left);
}

/** The first candidate that agrees with the province (and district, when both are known). */
export function pickCandidate(candidates: GeocodeCandidate[], expected: { province: string | null; district: string | null }) {
  return (
    candidates.find((candidate) => {
      if (expected.province && candidate.province && !sameName(candidate.province, expected.province)) return false;
      if (expected.district && candidate.district && !sameName(candidate.district, expected.district)) {
        // A district query may legitimately return the province centre.
        return candidate.precision === "city";
      }
      return true;
    }) ?? null
  );
}

function coarser(a: LocationPrecision, b: LocationPrecision): LocationPrecision {
  return isMorePrecise(a, b) ? b : a;
}

export interface LocateResult {
  geocode: GeocodeResult | null;
  precision: LocationPrecision;
  confidence: number;
  label: string;
  queries: number;
}

/** Places an analysed post on the map with Nominatim, never more precise than the text supports. */
export async function locate(geocoder: Geocoder, location: BotAnalysis["location"], signal?: AbortSignal): Promise<LocateResult> {
  const label = formatLocationLabel({
    neighborhood: location.neighborhood,
    district: location.district,
    province: location.province,
    fallback: location.mention || null,
  });
  const queries = geocodeQueries(location);
  let attempts = 0;
  for (const [index, item] of queries.entries()) {
    attempts += 1;
    const candidates = await geocoder.search(item.query, { limit: 5, signal });
    const candidate = pickCandidate(candidates, { province: location.province, district: namedDistrict(location.district) });
    if (!candidate) continue;
    // Nominatim types central districts (Konak, Antakya) as cities; the district name tells them apart.
    const candidatePrecision =
      candidate.precision === "city" && item.level !== "city" && location.district && sameName(candidate.district, location.district) ? "district" : candidate.precision;
    const precision = coarser(coarser(item.level, candidatePrecision), location.precision === "unknown" ? item.level : location.precision);
    // Falling back to a broader query lowers the confidence in the position.
    const confidence = Math.max(0.1, location.confidence * (index === 0 ? 1 : 0.85));
    const { importance: _importance, placeRank: _placeRank, street: _street, ...geocode } = candidate;
    return {
      geocode: { ...geocode, precision },
      precision,
      confidence: Math.round(confidence * 100) / 100,
      label: label === "Türkiye" ? formatLocationLabel({ ...candidate, fallback: candidate.displayName }) : label,
      queries: attempts,
    };
  }
  return { geocode: null, precision: "unknown", confidence: 0, label, queries: attempts };
}
