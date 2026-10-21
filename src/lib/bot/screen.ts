import type { SourceTrust } from "@/lib/domain/constants";
import { foldTurkish } from "@/lib/domain/text";

/**
 * Word stems (Turkish, folded) that indicate a local incident. Stems match the start of a word, so suffixed
 * forms ("yangında", "yaralandı") match too. Stems with a space match a phrase that starts at a word.
 */
const INCIDENT_STEMS = [
  "kaza", "carpis", "carpt", "devril", "takla", "yayaya", "otobus", "kamyon", "tir", "motosiklet",
  "yangin", "alev", "patlam", "patlay", "dogalgaz", "tup", "duman", "itfaiye",
  "deprem", "sarsinti", "artci", "sel", "selde", "su baskin", "heyelan", "firtina", "hortum", "yildirim dus", "dolu yag",
  "cig dus", "coktu", "cokme", "enkaz", "mahsur", "afad", "kurtar",
  "kayip", "kaybolan", "araniyor", "arama kurtarma", "bogul", "ceset", "cesed",
  "yarali", "yaralan", "hayatini kayb", "olu", "olu bulun", "cansiz beden", "can verdi", "intihar",
  "bicak", "silah", "ates ac", "kursun", "cinayet", "oldur", "katil",
  "gasp", "hirsiz", "soygun", "kapkac", "calindi", "calan", "dolandir", "sahte", "tefeci",
  "uyusturucu", "narkotik", "esrar", "metamfetamin", "kacak",
  "operasyon", "gozalti", "tutuklan", "yakalan", "saldiri", "saldirgan", "kavga", "darp", "rehin",
  "istismar", "taciz", "tecavuz", "siddet",
  "bomba", "supheli paket", "teror", "jandarma", "polis", "emniyet",
  "elektrik carp", "is kazasi", "zehirlen", "karbonmonoksit", "kopek saldir", "ayi saldir",
];

/** Stems that only count as whole words: as prefixes they would match everyday words ("katıldı", "tirat"). */
const SHORT_EXACT = new Set(["olu", "tir", "tup", "sel", "katil"]);

/** Everyday words that share a prefix with an incident stem ("kazandı" is not "kaza"). */
const EXCLUDED_PREFIXES: Record<string, string[]> = {
  kaza: ["kazan", "kazak"],
  alev: ["alevi"],
  esrar: ["esrarengiz"],
};

function matches(text: string, stems: string[]): string | null {
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  const joined = ` ${words.join(" ")} `;
  for (const stem of stems) {
    if (stem.includes(" ")) {
      if (joined.includes(` ${stem}`)) return stem;
      continue;
    }
    if (SHORT_EXACT.has(stem)) {
      if (words.includes(stem)) return stem;
      continue;
    }
    const excluded = EXCLUDED_PREFIXES[stem] ?? [];
    if (words.some((word) => word.startsWith(stem) && !excluded.some((prefix) => word.startsWith(prefix)))) return stem;
  }
  return null;
}

export type ScreenReason = "too_old" | "too_short" | "no_keywords" | "keyword_filter";

export interface ScreenResult {
  pass: boolean;
  reason?: ScreenReason;
  matched?: string;
}

/**
 * Cheap checks before any AI call: age, length and, for media and community feeds, at least one incident keyword.
 * Official sources skip the keyword check.
 */
export function screenEntry(input: {
  title: string | null;
  body: string;
  publishedAt: Date | null;
  trust: SourceTrust;
  keywordFilter: string[];
  maxAgeHours: number;
  keywordPrefilter: boolean;
  now?: Date;
}): ScreenResult {
  const now = input.now ?? new Date();
  if (input.publishedAt && now.getTime() - input.publishedAt.getTime() > input.maxAgeHours * 3600 * 1000) {
    return { pass: false, reason: "too_old" };
  }
  const text = foldTurkish(`${input.title ?? ""} ${input.body}`);
  if (text.replace(/\s+/g, "").length < 25) return { pass: false, reason: "too_short" };

  if (input.keywordFilter.length) {
    const custom = matches(text, input.keywordFilter.map((keyword) => foldTurkish(keyword.trim())).filter(Boolean));
    if (!custom) return { pass: false, reason: "keyword_filter" };
  }

  if (input.keywordPrefilter && input.trust !== "official") {
    const matched = matches(text, INCIDENT_STEMS);
    if (!matched) return { pass: false, reason: "no_keywords" };
    return { pass: true, matched };
  }
  return { pass: true };
}
