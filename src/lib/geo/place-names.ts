import { foldTurkish } from "@/lib/domain/text";

/**
 * Whether an OSM name is the place a story names. Similar-looking names are not enough for a map that people choose
 * homes by: "Antakya Mobilyacıları Sanayi Sitesi" must not pin "Yeni Sanayi Sitesi Eczanesi" next door. A name is
 * read as three kinds of words:
 *
 *   kind words   what sort of place it is: "Sanayi Sitesi", "Parkı", "Eczanesi" (the last one is the head)
 *   area words   the district or province around it: "Antakya", "Uşak"
 *   telling words the rest, which tell this place from its neighbors: "Mobilyacıları", "Deri", "Forum"
 *
 * Every telling word must appear in the OSM name, the OSM name may not add more of its own than it shares, and both
 * must be the same kind of place. A name with no telling words ("Zeytinburnu Sahil Parkı") is told by its area.
 */

/** The last kind word of a name says what the place is; synonyms share a class. */
const HEADS: Record<string, string> = {
  site: "estate", sanayi: "estate", bolge: "estate", osb: "estate", konut: "estate", evler: "estate", blok: "estate",
  apartman: "estate", rezidans: "estate", residence: "estate", lojman: "estate",
  park: "park", bahce: "park", koru: "park", mesire: "park", orman: "park",
  avm: "center", merkez: "center", plaza: "center", pasaj: "center", han: "center", carsi: "center", pazar: "center",
  hal: "center", kompleks: "center", outlet: "center",
  eczane: "pharmacy",
  hastane: "hospital", poliklinik: "hospital", klinik: "hospital",
  universite: "school", fakulte: "school", okul: "school", lise: "school", ilkokul: "school", ortaokul: "school",
  anaokul: "school", kolej: "school", kampus: "school", yurt: "school", enstitu: "school", akademi: "school",
  cami: "worship", mescit: "worship", kilise: "worship", cemevi: "worship", sinagog: "worship", turbe: "worship",
  mezarlik: "cemetery",
  istasyon: "transport", durak: "transport", terminal: "transport", otogar: "transport", garaj: "transport",
  liman: "transport", iskele: "transport", havalimani: "transport", havaalani: "transport", gar: "transport", otopark: "transport",
  kopru: "structure", tunel: "structure", viyaduk: "structure", gecit: "structure", kavsak: "structure",
  cadde: "road", sokak: "road", bulvar: "road", yol: "road", otoyol: "road",
  mahalle: "area", koy: "area", mevki: "area", belde: "area",
  mudurluk: "office", belediye: "office", valilik: "office", kaymakamlik: "office", adliye: "office", karakol: "office",
  emniyet: "office", jandarma: "office", itfaiye: "office", cezaevi: "office", kisla: "office", bakanlik: "office", banka: "office",
  restoran: "food", lokanta: "food", kafe: "food", cafe: "food", firin: "food", pastane: "food", kahvehane: "food",
  otel: "hotel", motel: "hotel", pansiyon: "hotel",
  fabrika: "factory", tesis: "factory", depo: "factory", atolye: "factory", santral: "factory", maden: "factory",
  rafineri: "factory", imalathane: "factory", santiye: "factory",
  plaj: "beach", sahil: "beach",
  meydan: "square",
  stadyum: "sport", stad: "sport", spor: "sport", salon: "sport", havuz: "sport",
  muze: "culture", kutuphane: "culture", tiyatro: "culture", sinema: "culture", kultur: "culture", kongre: "culture", fuar: "culture",
  magaza: "shop", market: "shop", galeri: "shop", dukkan: "shop", kuyumcu: "shop", bina: "building", ev: "building",
  isyeri: "building", tarla: "field",
  gol: "water", baraj: "water", dere: "water", irmak: "water", nehir: "water",
  tepe: "hill", dag: "hill", yayla: "hill",
};

/** Kind words that never head a name but never tell places apart either. */
const MODIFIERS = new Set([
  "organize", "ihtisas", "kucuk", "toplu", "devlet", "egitim", "arastirma", "sehir", "alisveris", "yaya", "ust", "alt",
  "genel", "ozel", "millet", "saglik", "il", "ilce", "buyuksehir", "toki", "anadolu", "meslek", "mesleki", "teknik",
  "fen", "endustri",
]);

/** "OSB" and "AVM" are written out as often as not. */
const EXPANSIONS: Record<string, string[]> = { osb: ["organize", "sanayi", "bolge"], avm: ["alisveris", "merkez"] };

const STOP = new Set(["ve", "ile", "de", "da", "the", "of"]);

/** Inflections that follow a name in Turkish: possessive, plural, case endings ("Parkı", "Sitesinde", "Mobilyacıları"). */
const SUFFIX = /^(?:s?[iu]|y?[iu]|y?[ae]|l[ae]r[iu]?|n?[iu]n|s?[iu]?n?[dt][ae]n?|l[ae]r[iu]?n?[dt][ae]n?)$/;
/** After a three-letter word only the possessive: "Hanı", "Yolu", but "Altın" is not "Alt". */
const SHORT_SUFFIX = /^s?[iu]$/;
const SOFTENED: Record<string, string> = { k: "g", p: "b", t: "d", c: "c" };

/** One word against another, tolerant to inflection and consonant softening ("Sokak" = "Sokağı", "Park" = "Parkı"). */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (/^\d/.test(a) || /^\d/.test(b)) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3) return false;
  const suffix = short.length === 3 ? SHORT_SUFFIX : SUFFIX;
  if (long.startsWith(short)) return suffix.test(long.slice(short.length));
  const stem = short.slice(0, -1);
  const softened = SOFTENED[short.at(-1)!];
  return Boolean(softened && long.startsWith(stem) && long[stem.length] === softened && suffix.test(long.slice(stem.length + 1)));
}

function words(value: string): string[] {
  return foldTurkish(value)
    .replace(/['’`][a-z]*/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => (word.length > 1 || /\d/.test(word)) && !STOP.has(word))
    .flatMap((word) => EXPANSIONS[word] ?? [word]);
}

const headOf = (word: string) => Object.keys(HEADS).find((head) => sameWord(word, head));
const isKind = (word: string) => headOf(word) !== undefined || [...MODIFIERS].some((modifier) => sameWord(word, modifier));

interface ReadName {
  telling: string[];
  kinds: string[];
  areas: string[];
  /** The class of the last kind word, when the name ends with one. */
  head: string | null;
}

function readName(value: string, areaWords: string[]): ReadName {
  const all = words(value);
  const telling: string[] = [];
  const kinds: string[] = [];
  const areas: string[] = [];
  for (const word of all) {
    if (isKind(word)) kinds.push(word);
    else if (areaWords.some((area) => sameWord(word, area))) areas.push(word);
    else telling.push(word);
  }
  const last = all.filter((word) => !areas.includes(word)).at(-1);
  const head = last && kinds.includes(last) ? (HEADS[headOf(last) ?? ""] ?? null) : null;
  return { telling, kinds, areas, head };
}

/** Whether a name says which place it is: "Yaya üst geçidi" or "fabrika" alone does not. */
export function isPlaceName(query: string, areas: Array<string | null | undefined> = []): boolean {
  const read = readName(query, areaWordsOf(areas));
  return read.telling.length > 0 || (read.kinds.length > 0 && read.areas.length > 0);
}

function areaWordsOf(areas: Array<string | null | undefined>): string[] {
  return areas.flatMap((area) => (area ? words(area) : [])).filter((word) => !isKind(word));
}

/**
 * How well an OSM name matches the place a story names, in [0, 1]; 0 when it is another place. `areas` are the
 * story's province, district and neighborhood names, which a place name may or may not repeat; `own` is the OSM
 * place's own address (its mahalle, ilçe, il).
 */
export function placeNameScore(query: string, name: string, areas: Array<string | null | undefined> = [], own: Array<string | null | undefined> = []): number {
  const areaWords = areaWordsOf(areas);
  const ownWords = areaWordsOf(own);
  const wanted = readName(query, areaWords);
  const found = readName(name, [...areaWords, ...ownWords]);
  const toldByArea = wanted.telling.length === 0;
  if (toldByArea && !(wanted.kinds.length > 0 && wanted.areas.length > 0)) return 0;
  if (wanted.head && found.head && wanted.head !== found.head) return 0;
  const nameWords = [...found.telling, ...found.kinds, ...found.areas];
  const inName = (word: string) => nameWords.some((other) => sameWord(word, other));
  if (!wanted.telling.every(inName)) return 0;
  const queryWords = [...wanted.telling, ...wanted.kinds, ...wanted.areas];
  const extra = found.telling.filter((word) => !queryWords.some((other) => sameWord(word, other))).length;
  if (!toldByArea) {
    if (extra > wanted.telling.length) return 0;
  } else {
    // "Zeytinburnu Sahil Parkı": every kind word, and the area either in the OSM name or as the address of a place
    // OSM names by its own mahalle ("Kazlıçeşme Sahil Parkı" in Zeytinburnu). Another telling word only next to an
    // area ("Ankara Bilkent Şehir Hastanesi").
    if (!wanted.kinds.every(inName)) return 0;
    const placed = (word: string) => inName(word) || (found.areas.length > 0 && ownWords.some((other) => sameWord(word, other)));
    if (!wanted.areas.every(placed)) return 0;
    if (extra > (found.areas.length > 0 ? 1 : 0)) return 0;
  }
  const sameHead = wanted.head !== null && wanted.head === found.head;
  return Math.round((1 / (1 + extra)) * (sameHead ? 1 : 0.9) * 100) / 100;
}
