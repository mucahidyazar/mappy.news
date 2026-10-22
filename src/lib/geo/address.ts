import { foldTurkish, normalizeWhitespace } from "@/lib/domain/text";

/** Turkish address abbreviations, expanded so that geocoders and OSM names match ("Atatürk Cad." → "Atatürk Caddesi"). */
const ABBREVIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/(^|\s)(mah|mh)\.?(?=\s|,|$)/giu, "$1Mahallesi"],
  [/(^|\s)(cad|cd)\.?(?=\s|,|$)/giu, "$1Caddesi"],
  [/(^|\s)(sok|sk)\.?(?=\s|,|$)/giu, "$1Sokak"],
  [/(^|\s)(bulv|blv|bul)\.?(?=\s|,|$)/giu, "$1Bulvarı"],
  [/(^|\s)apt\.?(?=\s|,|$)/giu, "$1Apartmanı"],
  [/(^|\s)sit\.?(?=\s|,|$)/giu, "$1Sitesi"],
  [/(^|\s)(mevk|mvk)\.?(?=\s|,|$)/giu, "$1mevkii"],
];

/** Words that describe "around" a place; OSM names never carry them. */
const LOCALITY_SUFFIX = /\s+(mevkii|mevkisi|mevki|civarı|civarında|yakınları|yakınında|önü|önünde|köyü|köy)(?=$|[\s,.;])/giu;

function titleCaseTurkish(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/(^|[\s(/-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toLocaleUpperCase("tr-TR"));
}

/** Cleans one address part: whitespace, abbreviations, and ALL-CAPS feed text. */
export function normalizeAddressPart(value: string | null | undefined): string | null {
  let text = normalizeWhitespace(value ?? "").replace(/[“”"]/g, "");
  if (!text) return null;
  if (text === text.toLocaleUpperCase("tr-TR") && /\p{Lu}{3}/u.test(text)) text = titleCaseTurkish(text);
  for (const [pattern, replacement] of ABBREVIATIONS) text = text.replace(pattern, replacement);
  return normalizeWhitespace(text) || null;
}

/** "Hisar Köyü mevkisi" → "Hisar": the name as OSM stores villages and localities. */
export function localityName(value: string | null | undefined): string | null {
  const text = normalizeAddressPart(value);
  return text ? normalizeWhitespace(text.replace(LOCALITY_SUFFIX, "")) || null : null;
}

/** "No: 12/A", "12 numaralı" → "12/A". */
export function normalizeHouseNumber(value: string | null | undefined): string | null {
  const match = /(\d+[a-zA-ZçğıöşüÇĞİÖŞÜ]?(?:\s*\/\s*[\dA-Za-z]+)?)/.exec(value ?? "");
  return match ? match[1]!.replace(/\s+/g, "") : null;
}

/** "Merkez" is every province's central district; OSM knows it by the city's name. */
export function isCentralDistrict(value: string | null | undefined): boolean {
  return Boolean(value && /(^|\s)merkez$/.test(foldTurkish(value.trim())));
}

const STREET_KINDS: ReadonlyArray<[RegExp, string]> = [
  [/\s+(sokak|sokağı|sok|sk)\.?$/iu, "(sokak|sokağı)"],
  [/\s+(caddesi|cadde|cad|cd)\.?$/iu, "(caddesi|cadde)"],
  [/\s+(bulvarı|bulvar|bulv|blv)\.?$/iu, "(bulvarı|bulvar)"],
  [/\s+(otoyolu|otoyol)$/iu, "(otoyolu|otoyol)"],
  [/\s+(yolu|yol)$/iu, "(yolu|yol)"],
  [/\s+(çıkmazı|çıkmaz)$/iu, "(çıkmazı|çıkmaz)"],
  [/\s+(meydanı|meydan)$/iu, "(meydanı|meydan)"],
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * An Overpass name pattern that tolerates how OSM spells the same street: "Demir Sokak" also matches
 * "Demir Sokağı", "1203/1 Sokak" matches "1203/1. Sokak". Null when the name is too vague to search for.
 */
export function streetNamePattern(street: string | null | undefined): string | null {
  const name = normalizeAddressPart(street);
  if (!name) return null;
  let base = name;
  let kind = "";
  for (const [pattern, alternatives] of STREET_KINDS) {
    if (pattern.test(base)) {
      base = base.replace(pattern, "");
      kind = alternatives;
      break;
    }
  }
  base = base.trim();
  // A bare "Sokak" or "Cadde" names nothing.
  if ((base.length < 2 && !/\d/.test(base)) || /^(sokak|sokağı|cadde|caddesi|bulvar|bulvarı|yol|yolu|otoyol|otoyolu)$/iu.test(base)) return null;
  const numbered = /^\d+(\/\d+)?\.?$/.test(base);
  const basePattern = numbered ? `${escapeRegex(base.replace(/\.$/, ""))}\\.?` : escapeRegex(base);
  return `^${basePattern}${kind ? ` ${kind}` : ""}$`;
}

const NUMBERED_STREET = /^(\d+(?:\/\d+)?\.?)\s+(caddesi|cadde|sokağı|bulvarı|bulvar)$/iu;
const KIND_SWAP: Record<string, string> = { caddesi: "Cadde", cadde: "Caddesi", sokagi: "Sokak", bulvari: "Bulvar", bulvar: "Bulvarı" };

/**
 * The spellings to search a street by. Numbered streets are written both ways in OSM ("2453. Cadde", "2472
 * Caddesi"), and a number alone finds nothing useful; named ones are caught by `streetBase` instead.
 */
export function streetSpellings(street: string | null | undefined): string[] {
  const name = normalizeAddressPart(street);
  if (!name) return [];
  const numbered = NUMBERED_STREET.exec(name);
  return numbered ? [name, `${numbered[1]} ${KIND_SWAP[foldTurkish(numbered[2]!)]}`] : [name];
}

export const isNumberedStreet = (street: string | null | undefined) => Boolean(street && /^\d/.test(street.trim()));

/** "Demir Sokak" → "Demir": a looser search for streets that OSM spells differently ("Demir Sokağı"). */
export function streetBase(street: string | null | undefined): string | null {
  const name = normalizeAddressPart(street);
  if (!name) return null;
  for (const [pattern] of STREET_KINDS) {
    if (pattern.test(name)) return name.replace(pattern, "").trim() || null;
  }
  return name;
}

/** Everyday names of national roads and how OSM names them. */
const ROAD_ALIASES: ReadonlyArray<[RegExp, string[]]> = [
  [/^tem\b/iu, ["Avrupa Otoyolu", "Anadolu Otoyolu"]],
  [/^e[\s.-]?5\b/iu, ["D-100"]],
  [/^o[\s.-]?3\b/iu, ["Avrupa Otoyolu"]],
  [/^o[\s.-]?4\b/iu, ["Anadolu Otoyolu"]],
  [/^o[\s.-]?7\b/iu, ["Kuzey Marmara Otoyolu"]],
];

/** The names to search a road by: as written ("D 100" → "D-100") and its OSM names ("TEM" → "Avrupa Otoyolu"). */
export function roadNames(road: string | null | undefined): string[] {
  const name = normalizeAddressPart(road);
  if (!name) return [];
  const ref = /^([DO])[\s.-]?(\d{1,3})(?!\d)/iu.exec(name);
  const names = [ref ? `${ref[1]!.toUpperCase()}-${ref[2]}` : name];
  const aliases = ROAD_ALIASES.filter(([pattern]) => pattern.test(name)).flatMap(([, names]) => names);
  // "Bandırma-Çanakkale kara yolu" is "Bandırma - Çanakkale Yolu" in OSM.
  const plain = name.replace(/\s+(kara\s*yolu|karayolu)$/iu, " Yolu");
  if (!ref && aliases.length === 0 && plain !== name) names.push(plain);
  names.push(...aliases);
  return [...new Set(names)];
}
