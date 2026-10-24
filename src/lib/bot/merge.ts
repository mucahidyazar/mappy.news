import { generateText, type LanguageModel, type LanguageModelUsage, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";

import { normalizeWhitespace, truncate } from "@/lib/domain/text";
import { type Casualties, MERGE_ACTIONS, type MergeAction } from "@/lib/domain/types";

import { providerOptions, samplingTemperature } from "./ai";
import type { DedupeCandidate } from "./dedupe";
import type { AiEffort, AiProvider } from "./settings";

export const MERGE_PROMPT_VERSION = "merge-2026-10-24b";

/** How many similar stories the AI compares a report with. */
export const MERGE_CANDIDATES = 4;

export interface MergeSubject {
  title: string;
  summary: string;
  content: string | null;
  categoryKey: string;
  occurredAt: Date;
  locationLabel: string;
  casualties: Casualties | null | undefined;
}

export interface MergeVerdict {
  action: MergeAction;
  /** The story it repeats or updates; null for a new incident. */
  target: DedupeCandidate | null;
  confidence: number;
  reason: string;
}

export interface MergeResult {
  verdict: MergeVerdict;
  usage: LanguageModelUsage | undefined;
  durationMs: number;
}

const SYSTEM_PROMPT = `Sen mappy.news'in kıdemli editörüsün. Haber botu yeni bir haber buldu; sistem aynı günlerde ve aynı bölgede benzer haberler de buldu. Yeni haberin bunlarla ilişkisine karar ver:
- duplicate: Listedeki bir haberle aynı olay ve yeni bir bilgi getirmiyor (başka bir kaynağın aynı haberi). Yeni haber o habere kaynak olarak eklenir.
- update: Listedeki bir haberle aynı olay, ama yeni bir gelişme var: ölü ya da yaralı sayısı değişti, şüpheli yakalandı ya da tutuklandı, kimlikler açıklandı, olayın nedeni ortaya çıktı, yangın söndürüldü, arama sonuçlandı gibi. Yeni haber o haberin güncellemesi olarak bağlanır.
- new: Farklı bir olay ya da emin değilsin.

KURALLAR:
- Yalnızca aynı somut olaysa (aynı yer, aynı zaman, aynı kişiler ya da araçlar) duplicate ya da update seç. Aynı ilçede aynı gün olan iki ayrı trafik kazası ya da iki ayrı yangın farklı olaylardır.
- Yanlış birleştirmek, ayrı bırakmaktan kötüdür: emin değilsen new seç ve confidence değerini düşük tut.
- Tarih, saat, yer, kişi sayısı ya da araç türü çelişiyorsa bunu gerekçede belirt.
- target: seçtiğin haberin harfi; new için null.
- confidence (0–1): kararına ne kadar güvendiğin.
- reason: kararın tek cümlelik Türkçe gerekçesi. Editör listeyi görmez: haberleri harfle değil olayla an ("A haberi" yerine "Meşrutiyet'teki bina çökmesi").`;

const STATUS_LABEL: Record<string, string> = { published: "yayında", pending: "incelemede" };

function when(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" }).format(date);
}

function casualtyLine(casualties: Partial<Casualties> | null | undefined) {
  const parts = [
    casualties?.deaths != null ? `${casualties.deaths} ölü` : null,
    casualties?.injured != null ? `${casualties.injured} yaralı` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "belirtilmemiş";
}

/** The letter each candidate goes by in the prompt: A, B, C… */
export const candidateKey = (index: number) => String.fromCharCode(65 + index);

export function buildMergePrompt(subject: MergeSubject, candidates: DedupeCandidate[]): { system: string; prompt: string } {
  const stories = candidates
    .map((candidate, index) =>
      [
        `[${candidateKey(index)}] Başlık: ${candidate.title}`,
        candidate.summary ? `Özet: ${truncate(normalizeWhitespace(candidate.summary), 400)}` : null,
        `Kategori: ${candidate.categoryKey}`,
        `Olay zamanı: ${when(candidate.occurredAt)}`,
        `Konum: ${candidate.locationLabel ?? ([candidate.district, candidate.province].filter(Boolean).join(", ") || "bilinmiyor")}`,
        `Kayıplar: ${casualtyLine({ deaths: candidate.deaths ?? null, injured: candidate.injured ?? null })}`,
        `Durum: ${STATUS_LABEL[candidate.status ?? ""] ?? candidate.status ?? "bilinmiyor"}${candidate.parentId ? ", daha önceki bir haberin güncellemesi" : ""}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  const prompt = `YENİ HABER
Başlık: ${subject.title}
Özet: ${truncate(normalizeWhitespace(subject.summary), 400)}
${subject.content ? `Metin: ${truncate(normalizeWhitespace(subject.content), 1500)}\n` : ""}Kategori: ${subject.categoryKey}
Olay zamanı: ${when(subject.occurredAt)}
Konum: ${subject.locationLabel}
Kayıplar: ${casualtyLine(subject.casualties)}

BENZER HABERLER
${stories}`;
  return { system: SYSTEM_PROMPT, prompt };
}

export function mergeSchema(keys: string[]) {
  return z.object({
    action: z.enum(MERGE_ACTIONS),
    target: z.string().nullable().describe(`Seçtiğin haberin harfi (${keys.join(", ")}); new için null`),
    confidence: z.number().nullable().describe("0–1"),
    reason: z.string().nullable().describe("Tek cümlelik Türkçe gerekçe"),
  });
}

export type RawMergeDecision = z.infer<ReturnType<typeof mergeSchema>>;

/** Maps the model's letter back to a story; a verdict about a story that isn't listed counts as "new". */
export function normalizeMergeDecision(raw: RawMergeDecision, candidates: DedupeCandidate[]): MergeVerdict {
  const letter = (raw.target ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  const index = letter.length === 1 ? letter.charCodeAt(0) - 65 : -1;
  const target = index >= 0 ? (candidates[index] ?? null) : null;
  const confidence = typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? Math.min(1, Math.max(0, raw.confidence)) : 0;
  const reason = truncate(normalizeWhitespace(raw.reason ?? ""), 300);
  if (raw.action === "new" || !target) return { action: "new", target: null, confidence: raw.action === "new" ? confidence : 0, reason };
  return { action: raw.action, target, confidence, reason };
}

/** Asks the configured model how a new report relates to similar stories. */
export async function decideMerge(input: {
  model: LanguageModel;
  provider: AiProvider;
  effort: AiEffort;
  subject: MergeSubject;
  candidates: DedupeCandidate[];
  signal?: AbortSignal;
}): Promise<MergeResult> {
  const candidates = input.candidates.slice(0, MERGE_CANDIDATES);
  const { system, prompt } = buildMergePrompt(input.subject, candidates);
  const started = Date.now();
  const call = () =>
    generateText({
      model: input.model,
      system,
      prompt,
      output: Output.object({ schema: mergeSchema(candidates.map((_, index) => candidateKey(index))) }),
      maxRetries: 2,
      maxOutputTokens: 600,
      abortSignal: input.signal,
      temperature: samplingTemperature(input.provider, input.effort),
      providerOptions: providerOptions(input.provider, input.effort),
    }).then((result) => ({ output: result.output, usage: result.usage }));
  let result: Awaited<ReturnType<typeof call>>;
  try {
    result = await call();
  } catch (error) {
    // JSON modes (DeepSeek) now and then return malformed content; one more try usually works.
    if (!NoObjectGeneratedError.isInstance(error)) throw error;
    result = await call();
  }
  return { verdict: normalizeMergeDecision(result.output, candidates), usage: result.usage, durationMs: Date.now() - started };
}
