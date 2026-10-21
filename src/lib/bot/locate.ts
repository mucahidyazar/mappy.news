import type { LocationPrecision } from "@/lib/domain/constants";
import { distanceKm, precisionRank } from "@/lib/domain/location";
import { foldTurkish, normalizeWhitespace, similarity } from "@/lib/domain/text";
import type { BotAnalysis, GeocodeResult } from "@/lib/domain/types";
import { isCentralDistrict, isNumberedStreet, localityName, normalizeAddressPart, normalizeHouseNumber, roadNames, streetBase, streetSpellings } from "@/lib/geo/address";
import type { Geocoder } from "@/lib/geo/geocoder";
import { linesBox, meetingPoints } from "@/lib/geo/geometry";
import { clusterPoints } from "@/lib/geo/overpass";
import { isPlaceName, placeNameScore } from "@/lib/geo/place-names";
import { type BoundingBox, boxAround, boxContains, boxSizeKm, expandBox, type GeocodeCandidate } from "@/lib/geo/types";

type AnalysisLocation = BotAnalysis["location"];

export type LocateMethod = "address" | "junction" | "place" | "street" | "road" | "neighborhood" | "district" | "city" | "mention";

/**
 * How likely a method's answer is right at the precision it claims, on top of the model's confidence in what it
 * read. Name-checked areas are near certain; fuzzy place names and long roads less so.
 */
const METHOD_TRUST: Record<LocateMethod, number> = {
  address: 0.97,
  junction: 0.92,
  place: 0.85,
  street: 0.9,
  road: 0.85,
  neighborhood: 0.95,
  district: 0.98,
  city: 0.98,
  mention: 0.7,
};
const PIN_ORDER: LocateMethod[] = ["address", "junction", "place", "street", "road"];

export interface LocateResult {
  geocode: (GeocodeResult & { method: LocateMethod }) | null;
  precision: LocationPrecision;
  confidence: number;
  label: string;
  queries: number;
  method: LocateMethod | null;
}

export interface LocationParts {
  mention: string;
  province: string | null;
  /** The named district; null for "Merkez", which OSM knows by the city's name. */
  district: string | null;
  centralDistrict: boolean;
  neighborhood: string | null;
  street: string | null;
  houseNumber: string | null;
  crossStreet: string | null;
  place: string | null;
  road: string | null;
  roadSection: string | null;
  confidence: number;
}

/** The model's location, cleaned for searching: abbreviations expanded, "mevkii"/"köyü" removed. */
export function readParts(location: AnalysisLocation): LocationParts {
  const district = normalizeAddressPart(location.district);
  return {
    mention: normalizeWhitespace(location.mention ?? ""),
    province: normalizeAddressPart(location.province),
    district: isCentralDistrict(district) ? null : district,
    centralDistrict: isCentralDistrict(district),
    neighborhood: localityName(location.neighborhood),
    street: normalizeAddressPart(location.street),
    houseNumber: normalizeHouseNumber(location.houseNumber),
    crossStreet: normalizeAddressPart(location.crossStreet),
    place: localityName(location.place),
    road: normalizeAddressPart(location.road),
    roadSection: normalizeAddressPart(location.roadSection),
    confidence: location.confidence,
  };
}

const ADMIN_WORDS = /\s+(ili|ilcesi|merkez|mahallesi|mah|koyu|koy|belediyesi|beldesi)$/;

/** "Kâğıthane" = "Kağıthane", "Kemalpaşa Mahallesi" = "Kemalpaşa". */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const clean = (value: string) => foldTurkish(value).replace(ADMIN_WORDS, "").trim();
  const left = clean(a);
  const right = clean(b);
  if (!left || !right) return false;
  return left === right || (Math.min(left.length, right.length) >= 4 && (left.includes(right) || right.includes(left)));
}

const STREET_KIND = /\s+(sokak|sokagi|sok|sk|caddesi|cadde|cad|cd|bulvari|bulvar|blv|yolu|yol)\.?$/;

/** "Demir Sokağı" = "Demir Sokak", "Bağdat Cd." = "Bağdat Caddesi". */
export function sameStreet(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const base = (value: string) => foldTurkish(normalizeAddressPart(value) ?? value).replace(STREET_KIND, "").replace(/\.$/, "").trim();
  return base(a).length > 0 && base(a) === base(b);
}

const firstLabel = (candidate: GeocodeCandidate) => candidate.displayName.split(",")[0]?.trim() ?? "";
const nameOf = (candidate: GeocodeCandidate) => candidate.name || firstLabel(candidate);
const isPin = (precision: LocationPrecision) => precisionRank(precision) <= precisionRank("street");

interface Area {
  candidate: GeocodeCandidate;
  box: BoundingBox;
  precision: LocationPrecision;
}

interface Pin {
  candidate: GeocodeCandidate;
  method: LocateMethod;
}

type Ask = <T>(task: Promise<T>) => Promise<T>;
type Point = { latitude: number; longitude: number };

/**
 * Places a story as precisely as its text allows. The district (or province) and neighborhood are found first;
 * every finer search is then confined to that box, so a "Demir Sokak" is the one in Kağıthane and not elsewhere:
 *
 *   house number  → Nominatim structured address
 *   intersection  → where both streets' geometries meet (Nominatim), or their shared node (self-hosted Overpass)
 *   named place   → Photon and Nominatim, when the names really agree (see place-names.ts); as precise as it is small
 *   street        → Nominatim, then the name alone or Overpass for spelling variants; the stretch nearest the mahalle
 *   road section  → the road inside the named section ("TEM, Avcılar mevkii")
 *
 * These run in parallel (each service keeps its own rate limit) and the most precise consistent answer wins. A
 * street, place or mahalle name that exists in several places of the box, without anything in the story to choose
 * by, stays at area level rather than being guessed. Coordinates never come from the model.
 */
export async function locate(geocoder: Geocoder, location: AnalysisLocation, signal?: AbortSignal): Promise<LocateResult> {
  const parts = readParts(location);
  let queries = 0;
  const ask: Ask = (task) => {
    queries += 1;
    return task;
  };
  const safely = async <T>(task: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await task();
    } catch (error) {
      if (signal?.aborted) throw error;
      return null;
    }
  };

  const area = await findArea(geocoder, parts, ask, signal);
  if (!area) {
    const fallback = await safely(() => byMention(geocoder, parts, ask, signal));
    return finish(parts, fallback, null, queries);
  }
  const hood = parts.neighborhood ? await safely(() => findNeighborhood(geocoder, parts, area, ask, signal)) : null;
  const scope = hood ? hood.box : expandBox(area.box, 0.05);
  const near: Point = { latitude: (hood ?? area).candidate.latitude, longitude: (hood ?? area).candidate.longitude };
  const sure = parts.confidence >= 0.45;

  const attempts: Array<Promise<Pin | null>> = [];
  if (sure && parts.street && parts.houseNumber && geocoder.address) attempts.push(safely(() => addressPin(geocoder, parts, area, ask, signal)));
  if (sure && parts.street && parts.crossStreet && (geocoder.junction || geocoder.lines)) {
    attempts.push(
      safely(async () => {
        const inScope = await junctionPin(geocoder, parts, scope, near, Boolean(hood), ask, signal);
        // Streets often run along a mahalle's edge: look across the district, nearest the mahalle first.
        return inScope ?? (hood ? junctionPin(geocoder, parts, expandBox(area.box, 0.05), near, true, ask, signal) : null);
      }),
    );
  }
  if (parts.place) attempts.push(safely(() => placePin(geocoder, parts, area, scope, near, ask, signal)));
  if (sure && parts.street) attempts.push(safely(() => streetPin(geocoder, parts, scope, near, Boolean(hood), ask, signal)));
  if (parts.road) attempts.push(safely(() => roadPin(geocoder, parts, area, ask, signal)));

  const pins = (await Promise.all(attempts)).filter((pin): pin is Pin => pin !== null);
  pins.sort(
    (a, b) => precisionRank(a.candidate.precision) - precisionRank(b.candidate.precision) || PIN_ORDER.indexOf(a.method) - PIN_ORDER.indexOf(b.method),
  );
  const fallback: Pin = hood
    ? { candidate: hood.candidate, method: "neighborhood" }
    : { candidate: area.candidate, method: area.precision === "city" ? "city" : "district" };
  // A large named place (an industrial zone) can be coarser than the mahalle already found.
  const best: Pin = pins[0] && precisionRank(pins[0].candidate.precision) <= precisionRank(hood ? "neighborhood" : area.precision) ? pins[0] : fallback;

  // House hunters read the mahalle and ilçe first: name them when the story or the pin's service doesn't.
  let neighborhood = hood?.candidate.neighborhood ?? parts.neighborhood ?? best.candidate.neighborhood ?? null;
  let district = hood?.candidate.district ?? (best === fallback ? null : best.candidate.district) ?? null;
  if (!neighborhood && isPin(best.candidate.precision)) {
    const reverse = await safely(() => ask(geocoder.reverse(best.candidate.latitude, best.candidate.longitude, { signal })));
    neighborhood = reverse?.neighborhood ?? null;
    district ??= reverse?.district ?? null;
  }
  return finish(parts, best, { area, neighborhood, district }, queries);
}

interface Context {
  area: Area;
  neighborhood: string | null;
  /** The ilçe the services put the pin in, for stories that name only the province. */
  district: string | null;
}

function finish(parts: LocationParts, pin: Pin | null, context: Context | null, queries: number): LocateResult {
  if (!pin) return { geocode: null, precision: "unknown", confidence: 0, label: labelFor(parts, null, null), queries, method: null };
  const precision: LocationPrecision =
    pin.method === "neighborhood" ? "neighborhood" : pin.method === "district" ? "district" : pin.method === "city" ? "city" : pin.candidate.precision;
  const province = parts.province ?? context?.area.candidate.province ?? pin.candidate.province;
  const areaDistrict = context?.area.precision === "district" ? context.area.candidate.district : null;
  const foundDistrict = context?.district && !isCentralDistrict(context.district) && !sameName(context.district, province) ? context.district : null;
  const district =
    parts.district ?? (parts.centralDistrict ? null : ((pin.method === "road" ? pin.candidate.district : null) ?? areaDistrict ?? foundDistrict ?? null));
  const neighborhood = context?.neighborhood ?? pin.candidate.neighborhood ?? null;
  const confidence = Math.round(Math.min(1, Math.max(0.1, parts.confidence * METHOD_TRUST[pin.method])) * 100) / 100;
  return {
    geocode: {
      latitude: pin.candidate.latitude,
      longitude: pin.candidate.longitude,
      displayName: pin.candidate.displayName,
      precision,
      province,
      district,
      neighborhood,
      provider: pin.candidate.provider,
      method: pin.method,
    },
    precision,
    confidence,
    label: labelFor(parts, pin.method, { province, district, neighborhood }),
    queries,
    method: pin.method,
  };
}

/** "Demir Sokak, Merkez Mahallesi, Kağıthane, İstanbul": the most specific named thing first, never a house number. */
function labelFor(parts: LocationParts, method: LocateMethod | null, admin: { province: string | null; district: string | null; neighborhood: string | null } | null) {
  const spot =
    method === "place"
      ? parts.place
      : method === "junction"
        ? `${parts.street} / ${parts.crossStreet}`
        : method === "street" || method === "address"
          ? parts.street
          : method === "road"
            ? [parts.road, parts.roadSection && !sameName(localityName(parts.roadSection), admin?.district) ? parts.roadSection : null].filter(Boolean).join(", ")
            : null;
  const kept: string[] = [];
  for (const part of [spot, admin?.neighborhood ?? parts.neighborhood, admin?.district ?? parts.district, admin?.province ?? parts.province]) {
    const text = part?.trim();
    // Skip a part that repeats an earlier one ("Uşak Deri OSB" and "Uşak Deri (Karma) OSB").
    if (!text || kept.some((previous) => foldTurkish(previous) === foldTurkish(text) || similarity(previous, text) >= 0.6)) continue;
    kept.push(text);
  }
  const label = kept.join(", ");
  return label || parts.mention || "Türkiye";
}

/** The district (or, for "Merkez" and unnamed districts, the province) with its bounding box. */
async function findArea(geocoder: Geocoder, parts: LocationParts, ask: Ask, signal?: AbortSignal): Promise<Area | null> {
  if (parts.district) {
    const found = await ask(geocoder.search([parts.district, parts.province].filter(Boolean).join(", "), { limit: 6, signal }));
    const inProvince = (candidate: GeocodeCandidate) => !parts.province || !candidate.province || sameName(candidate.province, parts.province);
    const named = (candidate: GeocodeCandidate) => sameName(candidate.district, parts.district) || sameName(firstLabel(candidate), parts.district);
    const match =
      found.find((candidate) => (candidate.precision === "district" || candidate.precision === "city") && named(candidate) && inProvince(candidate)) ??
      found.find((candidate) => candidate.precision === "neighborhood" && named(candidate) && inProvince(candidate));
    if (match) {
      return {
        candidate: { ...match, district: parts.district, province: match.province ?? parts.province },
        box: match.bbox ?? boxAround(match, 8),
        precision: "district",
      };
    }
  }
  if (parts.province && parts.centralDistrict) {
    // OSM names a province's central district "<İl> Merkez" ("Zonguldak Merkez").
    const found = await ask(geocoder.search(`${parts.province} Merkez, ${parts.province}`, { limit: 4, signal }));
    const match = found.find((candidate) => candidate.precision === "district" && sameName(firstLabel(candidate), `${parts.province} Merkez`));
    if (match?.bbox) return { candidate: { ...match, district: null, province: match.province ?? parts.province }, box: match.bbox, precision: "district" };
  }
  if (parts.province) {
    const found = await ask(geocoder.search(parts.province, { limit: 6, signal }));
    const match =
      found.find(
        (candidate) =>
          (candidate.precision === "city" || candidate.precision === "region") && (sameName(candidate.province, parts.province) || sameName(firstLabel(candidate), parts.province)),
      ) ?? found.find((candidate) => candidate.precision === "city");
    if (match) {
      // "Merkez" stories are in the city itself, not anywhere in the province.
      const box = parts.centralDistrict ? boxAround(match, 9) : (match.bbox ?? boxAround(match, 40));
      return { candidate: { ...match, province: match.province ?? parts.province }, box, precision: parts.centralDistrict ? "district" : "city" };
    }
  }
  return null;
}

async function findNeighborhood(geocoder: Geocoder, parts: LocationParts, area: Area, ask: Ask, signal?: AbortSignal): Promise<Area | null> {
  const name = parts.neighborhood!;
  // OSM writes some mahalles with "Mahallesi" and some without: try the other spelling once.
  const bare = name.replace(/\s+mahallesi$/iu, "");
  const spellings = bare === name ? [name, `${name} Mahallesi`] : [name, bare];
  const named = (candidate: GeocodeCandidate) => sameName(candidate.neighborhood, bare) || sameName(firstLabel(candidate), bare);
  // The box reaches a little beyond the district: not the same-named mahalle next door.
  const inDistrict = (candidate: GeocodeCandidate) => !parts.district || !candidate.district || sameName(candidate.district, parts.district);
  for (const spelling of spellings) {
    const found = await ask(geocoder.search([spelling, parts.district, parts.province].filter(Boolean).join(", "), { limit: 6, bbox: expandBox(area.box, 0.1), signal }));
    const matches = found.filter((candidate) => (candidate.precision === "neighborhood" || candidate.precision === "district") && named(candidate) && inDistrict(candidate));
    if (matches.length === 0) continue;
    // A province has many "Hisar"s and "Cumhuriyet Mahallesi"s: pick one only when the story says which.
    const places = clusterPoints(matches, 3);
    const chosen = places.length === 1 ? places[0]! : await nearestToClues(geocoder, parts, area, places, ask, signal);
    if (!chosen) return null;
    // The mahalle's boundary, with its real extent and official name, over a point placed inside it.
    const match = matches.find((candidate) => chosen.includes(candidate) && candidate.kind === "boundary:administrative") ?? matches.find((candidate) => chosen.includes(candidate))!;
    return { candidate: { ...match, neighborhood: firstLabel(match) || name }, box: expandBox(match.bbox ?? boxAround(match, 1.2), 0.15), precision: "neighborhood" };
  }
  return null;
}

/** Other places a story names, for telling same-named mahalles apart: "Süvermez köyü yolu" → "Süvermez". */
export function clueNames(parts: LocationParts): string[] {
  const names: string[] = [];
  for (const way of [parts.street, parts.crossStreet, parts.road]) {
    const toward = way ? /^(.+?)\s+(?:köyü\s+)?yolu$/iu.exec(way) : null;
    if (toward && !/\d/.test(toward[1]!)) names.push(...toward[1]!.split(/\s*[-–]\s*/));
  }
  for (const value of [parts.roadSection, parts.place]) {
    const locality = localityName(value);
    if (locality) names.push(locality);
  }
  return [...new Set(names)].filter((name) => name.length >= 3 && !sameName(name, parts.neighborhood)).slice(0, 2);
}

/** Of several same-named places, the one clearly next to another place the story names; null when none is. */
async function nearestToClues(
  geocoder: Geocoder,
  parts: LocationParts,
  area: Area,
  places: GeocodeCandidate[][],
  ask: Ask,
  signal?: AbortSignal,
): Promise<GeocodeCandidate[] | null> {
  const anchors: Point[] = [];
  for (const clue of clueNames(parts)) {
    const found = await ask(geocoder.search([clue, parts.province].filter(Boolean).join(", "), { limit: 3, bbox: area.box, signal }));
    anchors.push(
      ...found.filter((candidate) => precisionRank(candidate.precision) <= precisionRank("district") && (sameName(firstLabel(candidate), clue) || sameName(candidate.neighborhood, clue))),
    );
    if (anchors.length) break;
  }
  if (anchors.length === 0) return null;
  const ranked = places
    .map((place) => ({ place, distance: Math.min(...place.flatMap((point) => anchors.map((anchor) => distanceKm(point, anchor)))) }))
    .sort((a, b) => a.distance - b.distance);
  const [first, second] = ranked;
  return first && first.distance <= 15 && (!second || first.distance * 2 <= second.distance) ? first.place : null;
}

async function addressPin(geocoder: Geocoder, parts: LocationParts, area: Area, ask: Ask, signal?: AbortSignal): Promise<Pin | null> {
  const found = await ask(
    geocoder.address!({ street: `${parts.houseNumber} ${parts.street}`, city: parts.district ?? area.candidate.district ?? parts.province, state: parts.province }, { signal }),
  );
  const hit = found.find((candidate) => candidate.precision === "exact" && boxContains(expandBox(area.box, 0.05), candidate) && sameStreet(candidate.street, parts.street));
  return hit ? { candidate: hit, method: "address" } : null;
}

const segmentOf = (name: string) => (candidate: GeocodeCandidate) => Boolean(candidate.lines?.length) && (sameStreet(candidate.street, name) || sameStreet(firstLabel(candidate), name));
const PAGE = 40;

/**
 * Where two named streets meet. A self-hosted Overpass knows the shared node; otherwise the streets' geometry from
 * Nominatim is intersected here (within 40 m counts as the junction itself, up to 90 m as its street corner).
 */
async function junctionPin(geocoder: Geocoder, parts: LocationParts, scope: BoundingBox, near: Point, inNeighborhood: boolean, ask: Ask, signal?: AbortSignal): Promise<Pin | null> {
  const street = parts.street!;
  const cross = parts.crossStreet!;
  if (geocoder.junction) {
    const found = await ask(geocoder.junction(street, cross, scope, { signal })).catch(() => [] as GeocodeCandidate[]);
    // The same pair of names can meet twice in a district; only a neighborhood tells which.
    if (found.length > 1 && !inNeighborhood) return null;
    if (found.length) return { candidate: [...found].sort((a, b) => distanceKm(a, near) - distanceKm(b, near))[0]!, method: "junction" };
  }
  if (!geocoder.lines) return null;
  const segments = async (name: string, box: BoundingBox) => {
    for (const spelling of streetSpellings(name)) {
      const found = (await ask(geocoder.lines!(spelling, box, { signal }))).filter(segmentOf(name));
      if (found.length) return found;
    }
    return [];
  };
  let first = await segments(street, scope);
  if (first.length === 0) return null;
  let second = await segments(cross, scope);
  if (second.length === 0) return null;
  // A long boulevard fills a page of segments: look again around the shorter street.
  if (first.length >= PAGE && second.length < PAGE) {
    const box = linesBox(second.flatMap((segment) => segment.lines ?? []), 0.3);
    if (box) first = await segments(street, box);
  } else if (second.length >= PAGE && first.length < PAGE) {
    const box = linesBox(first.flatMap((segment) => segment.lines ?? []), 0.3);
    if (box) second = await segments(cross, box);
  }
  const meetings = meetingPoints(
    first.flatMap((segment) => segment.lines ?? []),
    second.flatMap((segment) => segment.lines ?? []),
    { maxGapM: 90 },
  );
  if (meetings.length === 0) return null;
  if (!inNeighborhood && meetings.some((meeting) => distanceKm(meeting, meetings[0]!) > 0.3)) return null;
  const meeting = inNeighborhood ? [...meetings].sort((a, b) => distanceKm(a, near) - distanceKm(b, near))[0]! : meetings[0]!;
  return {
    candidate: {
      latitude: meeting.latitude,
      longitude: meeting.longitude,
      displayName: `${street} / ${cross}`,
      precision: meeting.distanceM <= 40 ? "exact" : "street",
      province: first[0]?.province ?? null,
      district: first[0]?.district ?? null,
      neighborhood: first[0]?.neighborhood ?? null,
      street,
      provider: "nominatim",
      importance: 0,
      placeRank: 0,
      kind: "nominatim:junction",
    },
    method: "junction",
  };
}

/** A named area is only as precise as it is small: a shop is a spot, a mall a few streets, an industrial zone more. */
export function sizedPrecision(candidate: GeocodeCandidate): LocationPrecision {
  if (!candidate.bbox || candidate.kind?.startsWith("highway:")) return candidate.precision;
  const size = boxSizeKm(candidate.bbox);
  const sized: LocationPrecision = size <= 0.25 ? "exact" : size <= 0.6 ? "street" : size <= 2.5 ? "neighborhood" : "district";
  return precisionRank(sized) > precisionRank(candidate.precision) ? sized : candidate.precision;
}

async function placePin(geocoder: Geocoder, parts: LocationParts, area: Area, scope: BoundingBox, near: Point, ask: Ask, signal?: AbortSignal): Promise<Pin | null> {
  const name = parts.place!;
  const areas = [parts.province, parts.district, parts.neighborhood, area.candidate.province, area.candidate.district, firstLabel(area.candidate)];
  // "Yaya üst geçidi" describes the scene; there is nothing to look up.
  if (!isPlaceName(name, areas)) return null;
  const none: GeocodeCandidate[] = [];
  const [photon, nominatim] = await Promise.all([
    geocoder.place ? ask(geocoder.place(name, { bbox: scope, near, signal })).catch(() => none) : Promise.resolve(none),
    ask(geocoder.search(name, { bbox: scope, limit: 5, signal })).catch(() => none),
  ]);
  const hits = [...photon, ...nominatim]
    .filter((candidate) => boxContains(expandBox(scope, 0.05), candidate))
    .map((candidate) => ({
      candidate: { ...candidate, precision: sizedPrecision(candidate) },
      score: placeNameScore(name, nameOf(candidate), areas, [candidate.neighborhood, candidate.district, candidate.province]),
    }))
    .filter((hit) => hit.score > 0 && precisionRank(hit.candidate.precision) <= precisionRank("district"));
  if (hits.length === 0) return null;
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      precisionRank(a.candidate.precision) - precisionRank(b.candidate.precision) ||
      distanceKm(a.candidate, near) - distanceKm(b.candidate, near),
  );
  // Two "BİM"s, two "Merkez Camii"s: the story doesn't say which, so neither.
  const best = hits.filter((hit) => hit.score === hits[0]!.score).map((hit) => hit.candidate);
  if (clusterPoints(best, 0.5).length > 1) return null;
  return { candidate: best[0]!, method: "place" };
}

async function streetPin(geocoder: Geocoder, parts: LocationParts, scope: BoundingBox, near: Point, inNeighborhood: boolean, ask: Ask, signal?: AbortSignal): Promise<Pin | null> {
  const street = parts.street!;
  const matches = (candidate: GeocodeCandidate) => isPin(candidate.precision) && (sameStreet(candidate.street, street) || sameStreet(firstLabel(candidate), street));
  let stretches: GeocodeCandidate[] = [];
  for (const spelling of streetSpellings(street)) {
    stretches = (await ask(geocoder.search(spelling, { bbox: scope, limit: 8, signal }))).filter(matches);
    if (stretches.length) break;
  }
  const base = streetBase(street);
  if (stretches.length === 0 && !isNumberedStreet(street) && base && base !== street && base.length >= 3) {
    // OSM may spell the street differently ("Demir Sokağı"): search the name alone and keep the same street.
    stretches = (await ask(geocoder.search(base, { bbox: scope, limit: 10, signal }))).filter(matches);
  }
  if (stretches.length) {
    if (clusterPoints(stretches, 0.6).length > 1 && !inNeighborhood) return null;
    const nearest = [...stretches].sort((a, b) => distanceKm(a, near) - distanceKm(b, near))[0]!;
    return { candidate: { ...nearest, precision: "street" }, method: "street" };
  }
  if (!geocoder.streetLine) return null;
  const lines = await ask(geocoder.streetLine(street, scope, { near, signal }));
  if (lines.length === 1 || (lines.length > 1 && inNeighborhood)) return { candidate: lines[0]!, method: "street" };
  return null;
}

const ROAD_SECTION_NOISE = /(istikamet|yönü|yönünde|çıkışı|girişi|kavşağı|gişe|kilometre|\bkm\b)/iu;

async function roadPin(geocoder: Geocoder, parts: LocationParts, area: Area, ask: Ask, signal?: AbortSignal): Promise<Pin | null> {
  let box = area.box;
  let sectionArea: GeocodeCandidate | null = null;
  const section = parts.roadSection ? localityName(parts.roadSection) : null;
  if (section && !ROAD_SECTION_NOISE.test(section) && !/\d/.test(section)) {
    const found = await ask(geocoder.search([section, parts.province].filter(Boolean).join(", "), { limit: 4, bbox: expandBox(area.box, 0.3), signal }));
    sectionArea =
      found.find(
        (candidate) => precisionRank(candidate.precision) <= precisionRank("district") && (sameName(firstLabel(candidate), section) || sameName(candidate.neighborhood, section)),
      ) ?? null;
    if (sectionArea) box = sectionArea.bbox ? expandBox(sectionArea.bbox, 0.25) : boxAround(sectionArea, 2.5);
  }
  const center: Point = { latitude: (box.north + box.south) / 2, longitude: (box.east + box.west) / 2 };
  // The section names the district the stretch is in ("Avcılar mevkii" → Avcılar).
  const located = (line: GeocodeCandidate): Pin => {
    const district = sectionArea?.precision === "district" ? (sectionArea.district ?? firstLabel(sectionArea)) : line.district;
    return { candidate: { ...line, precision: "street", district, province: line.province ?? sectionArea?.province ?? null }, method: "road" };
  };
  for (const name of roadNames(parts.road)) {
    const found = await ask(geocoder.search(name, { bbox: box, limit: 10, signal }));
    const stretches = found.filter((candidate) => {
      if (!candidate.kind?.startsWith("highway:")) return false;
      const label = candidate.street ?? firstLabel(candidate);
      return sameStreet(label, name) || foldTurkish(label).includes(foldTurkish(name));
    });
    if (stretches.length) return located([...stretches].sort((a, b) => distanceKm(a, center) - distanceKm(b, center))[0]!);
  }
  if (!geocoder.streetLine) return null;
  const [line] = await ask(geocoder.streetLine(parts.road!, box, { near: center, signal }));
  return line ? located(line) : null;
}

/** No district or province to start from: the mention as written, if it names one clear place in Türkiye. */
async function byMention(geocoder: Geocoder, parts: LocationParts, ask: Ask, signal?: AbortSignal): Promise<Pin | null> {
  if (parts.mention.length < 3) return null;
  const found = await ask(geocoder.search(parts.mention, { limit: 3, signal }));
  const hit = found.find((candidate) => precisionRank(candidate.precision) <= precisionRank("district"));
  return hit ? { candidate: hit, method: "mention" } : null;
}
