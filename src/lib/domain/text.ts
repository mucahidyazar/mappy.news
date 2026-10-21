const TURKISH_FOLD: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  i̇: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/** Lowercases with Turkish rules ("İ" → "i", "I" → "ı") and folds diacritics, for search and matching. */
export function foldTurkish(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]|i̇/g, (char) => TURKISH_FOLD[char] ?? char)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  ndash: "–",
  mdash: "—",
};

const isCodePoint = (code: number) => Number.isInteger(code) && code > 0 && code <= 0x10ffff;

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return isCodePoint(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Plain text from feed HTML: drops tags, scripts and styles, decodes entities. Linear time. */
export function stripHtml(value: string): string {
  const withoutBlocks = value.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const withBreaks = withoutBlocks.replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, "\n");
  return normalizeWhitespace(decodeEntities(withBreaks.replace(/<[^>]+>/g, " ")));
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const slice = value.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

/** URL slug from a Turkish title: "Kadıköy'de yangın!" → "kadikoyde-yangin". */
export function slugify(value: string, maxLength = 80): string {
  const slug = foldTurkish(value)
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= maxLength) return slug || "haber";
  const cut = slug.slice(0, maxLength);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > maxLength * 0.5 ? cut.slice(0, lastDash) : cut) || "haber";
}

const SLUG_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function randomSuffix(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => SLUG_ALPHABET[byte % SLUG_ALPHABET.length]).join("");
}

export function newsSlug(title: string): string {
  return `${slugify(title, 72)}-${randomSuffix()}`;
}

const STOP_WORDS = new Set(
  [
    "ve", "ile", "bir", "bu", "su", "o", "de", "da", "ki", "mi", "icin", "olarak", "olan", "gibi", "daha", "en",
    "cok", "ama", "ancak", "veya", "ya", "hem", "ne", "her", "tum", "son", "dakika", "haber", "haberi", "sonra",
    "once", "kadar", "yeni", "iki", "uc", "the", "a", "an", "of", "in", "on", "and", "to", "is", "for",
  ].map((word) => word),
);

/** Folded word tokens without stop words; numbers are kept because they distinguish incidents. */
export function tokenize(value: string): string[] {
  return foldTurkish(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Word-set overlap in [0, 1], tolerant to Turkish suffixes by comparing the first five letters. */
export function similarity(a: string, b: string): number {
  const stem = (token: string) => (/^\d+$/.test(token) ? token : token.slice(0, 5));
  const left = new Set(tokenize(a).map(stem));
  const right = new Set(tokenize(b).map(stem));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export function searchText(...parts: Array<string | null | undefined>): string {
  return normalizeWhitespace(foldTurkish(parts.filter(Boolean).join(" ")));
}
