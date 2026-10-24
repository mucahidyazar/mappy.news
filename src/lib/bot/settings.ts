import { eq } from "drizzle-orm";
import { z } from "zod";

import { appSettings } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/types";

export const AI_PROVIDERS = ["openai", "deepseek", "google", "anthropic", "xai"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_EFFORTS = ["low", "medium", "high"] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

export interface CatalogModel {
  id: string;
  /** USD per 1M tokens, from the provider's pricing page; filled into the settings when the model is picked. */
  input?: number;
  output?: number;
}

/**
 * Models offered in the settings, cheapest first; any id the provider accepts can be typed in instead. OpenAI and
 * DeepSeek models and prices as listed by the providers on 2026-10-14 (DeepSeek: off-peak prices).
 */
export const MODEL_CATALOG: Record<AiProvider, CatalogModel[]> = {
  openai: [
    { id: "gpt-6-luna", input: 0.1, output: 0.5 },
    { id: "gpt-6.1-sol", input: 2, output: 10 },
    { id: "gpt-6-astra", input: 10, output: 50 },
  ],
  deepseek: [
    { id: "deepseek-flash", input: 0.15, output: 0.6 },
    { id: "deepseek-v4-pro", input: 0.66, output: 1.98 },
  ],
  google: [{ id: "gemini-flash-latest" }, { id: "gemini-flash-lite-latest" }, { id: "gemini-pro-latest" }],
  anthropic: [{ id: "claude-haiku-5-5" }, { id: "claude-sonnet-5-5" }],
  xai: [{ id: "grok-4.3" }],
};

export const AUTO_PUBLISH_MODES = ["off", "trusted", "all"] as const;

export const botSettingsSchema = z.object({
  /** Kill switch: the worker idles while this is false. */
  enabled: z.boolean().default(false),
  /** Analyse and log, but never create stories. */
  dryRun: z.boolean().default(false),
  ai: z
    .object({
      /** Only this provider is used; there is no automatic fallback to another one. */
      provider: z.enum(AI_PROVIDERS).default("openai"),
      model: z.string().trim().min(2).max(80).default("gpt-6-luna"),
      /** How much the model may reason before answering (OpenAI reasoning effort, DeepSeek thinking, …). */
      effort: z.enum(AI_EFFORTS).default("low"),
      /** USD; AI steps pause for the rest of the UTC day once reached. */
      dailyBudgetUsd: z.number().min(0).max(200).default(3),
      /** Estimated prices per million tokens, used for the spend counter. */
      inputPricePerMillion: z.number().min(0).max(100).default(0.1),
      outputPricePerMillion: z.number().min(0).max(400).default(0.5),
      concurrency: z.number().int().min(1).max(8).default(3),
    })
    .default({
      provider: "openai",
      model: "gpt-6-luna",
      effort: "low",
      dailyBudgetUsd: 3,
      inputPricePerMillion: 0.1,
      outputPricePerMillion: 0.5,
      concurrency: 3,
    }),
  review: z
    .object({
      /** Below this editorial score a post is rejected as not newsworthy. */
      minScore: z.number().min(0).max(1).default(0.45),
      /** Posts older than this are ignored when collected. */
      maxAgeHours: z.number().int().min(1).max(24 * 14).default(48),
      /** Media and community feeds are pre-screened with incident keywords before any AI call. */
      keywordPrefilter: z.boolean().default(true),
      /** When a feed only carries a teaser, the story page is read so the model sees the whole text. */
      readArticles: z.boolean().default(true),
    })
    .default({ minScore: 0.45, maxAgeHours: 48, keywordPrefilter: true, readArticles: true }),
  autoPublish: z
    .object({
      /** off: everything goes to review. trusted: sources marked auto-publish. all: every source. */
      mode: z.enum(AUTO_PUBLISH_MODES).default("off"),
      /** ISO time after which auto-publishing switches itself off again; null means no limit. */
      until: z.string().datetime().nullable().default(null),
      minScore: z.number().min(0).max(1).default(0.75),
      minLocationConfidence: z.number().min(0).max(1).default(0.75),
      /** Stories placed more coarsely than this always wait for an editor. */
      minPrecision: z.enum(["exact", "street", "neighborhood", "district"]).default("neighborhood"),
      allowSensitive: z.boolean().default(false),
      dailyLimit: z.number().int().min(0).max(1000).default(40),
    })
    .default({ mode: "off", until: null, minScore: 0.75, minLocationConfidence: 0.75, minPrecision: "neighborhood", allowSensitive: false, dailyLimit: 40 }),
  merge: z
    .object({
      /**
       * When a new report resembles stories from the same days and place, the AI decides whether it repeats one
       * (merged as a source), updates one (attached as an update) or is a new incident, and carries that out.
       * Off: near-certain repeats are merged by rule and the rest is left to editors as a suggestion.
       */
      auto: z.boolean().default(false),
      /** Below this the AI's verdict is only shown to editors as a suggestion. */
      minConfidence: z.number().min(0.5).max(1).default(0.75),
    })
    .default({ auto: false, minConfidence: 0.75 }),
  x: z
    .object({
      /** Posts read per UTC day across all X accounts (X bills per read). */
      dailyReadLimit: z.number().int().min(0).max(20_000).default(500),
    })
    .default({ dailyReadLimit: 500 }),
});

export type BotSettings = z.infer<typeof botSettingsSchema>;

export const BOT_SETTINGS_KEY = "bot.settings";
export const BOT_STATUS_KEY = "bot.status";

export const DEFAULT_BOT_SETTINGS: BotSettings = botSettingsSchema.parse({});

/** Settings with defaults for anything missing or invalid, so an old stored value never stops the worker. */
export function parseBotSettings(value: unknown): BotSettings {
  const parsed = botSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_BOT_SETTINGS;
}

export async function readBotSettings(db: DbExecutor): Promise<BotSettings> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, BOT_SETTINGS_KEY)).limit(1);
  return parseBotSettings(row?.value);
}

export async function writeBotSettings(db: DbExecutor, settings: BotSettings, userId: string | null) {
  await db
    .insert(appSettings)
    .values({ key: BOT_SETTINGS_KEY, value: settings, updatedById: userId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: settings, updatedById: userId, updatedAt: new Date() } });
}

/** Whether auto-publishing is active right now (mode on and not expired). */
export function autoPublishActive(settings: BotSettings, now = new Date()): boolean {
  if (settings.autoPublish.mode === "off") return false;
  if (settings.autoPublish.until && new Date(settings.autoPublish.until) <= now) return false;
  return true;
}

export const WORKER_STATES = ["starting", "idle", "collecting", "analyzing", "paused", "stopping", "waiting_lock"] as const;
export type WorkerState = (typeof WORKER_STATES)[number];

/** Set by the worker when the chosen provider refuses calls (no credit, bad key, rate limit). */
export interface AiPause {
  kind: "quota" | "auth" | "rate_limit";
  provider: AiProvider;
  model: string;
  message: string;
  until: string;
}

export interface WorkerStatus {
  state: WorkerState;
  instanceId: string;
  host: string;
  pid: number;
  version: string;
  startedAt: string;
  heartbeatAt: string;
  lastPassAt: string | null;
  lastPassMs: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  aiPause?: AiPause | null;
}
