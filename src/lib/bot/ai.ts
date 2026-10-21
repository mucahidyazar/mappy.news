import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { APICallError, type JSONValue, type LanguageModel, type LanguageModelUsage, RetryError } from "ai";

import type { AiEffort, AiPause, AiProvider, BotSettings } from "./settings";

export type AiKeys = Partial<Record<AiProvider, string>>;

export function aiKeysFromEnv(env: NodeJS.ProcessEnv = process.env): AiKeys {
  return {
    openai: env.OPENAI_API_KEY || undefined,
    deepseek: env.DEEPSEEK_API_KEY || undefined,
    google: env.GOOGLE_GENERATIVE_AI_API_KEY || env.GEMINI_API_KEY || undefined,
    anthropic: env.ANTHROPIC_API_KEY || undefined,
    xai: env.XAI_API_KEY || undefined,
  };
}

/** Which providers have a key, for the settings screen (never the keys themselves). */
export function configuredProviders(keys: AiKeys): Record<AiProvider, boolean> {
  return {
    openai: Boolean(keys.openai),
    deepseek: Boolean(keys.deepseek),
    google: Boolean(keys.google),
    anthropic: Boolean(keys.anthropic),
    xai: Boolean(keys.xai),
  };
}

export function createModel(provider: AiProvider, model: string, keys: AiKeys): LanguageModel | null {
  const apiKey = keys[provider];
  if (!apiKey) return null;
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "deepseek":
      return createDeepSeek({ apiKey })(model);
    case "google":
      return createGoogle({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "xai":
      return createXai({ apiKey })(model);
  }
}

/**
 * Reasoning per provider. "low" is plenty for this task (classify, extract, rewrite a short post) and keeps
 * answers fast and cheap; DeepSeek then runs without thinking.
 */
export function providerOptions(provider: AiProvider, effort: AiEffort): Record<string, Record<string, JSONValue>> | undefined {
  switch (provider) {
    case "openai":
      // Posts and drafts are not stored on OpenAI's side.
      return { openai: { reasoningEffort: effort, store: false } };
    case "deepseek":
      return effort === "low" ? { deepseek: { thinking: { type: "disabled" } } } : { deepseek: { thinking: { type: "enabled" }, reasoningEffort: "high" } };
    case "google":
      return { google: { thinkingConfig: { thinkingLevel: effort === "low" ? "low" : "high" } } };
    case "xai":
      return { xai: { reasoningEffort: effort === "low" ? "low" : "high" } };
    case "anthropic":
      return effort === "low" ? undefined : { anthropic: { thinking: { type: "enabled", budgetTokens: effort === "medium" ? 2_048 : 8_192 } } };
  }
}

/** Sampling temperature where the model accepts one (reasoning modes ignore or reject it). */
export function samplingTemperature(provider: AiProvider, effort: AiEffort): number | undefined {
  if (provider === "google") return 0.2;
  if ((provider === "deepseek" || provider === "anthropic") && effort === "low") return 0.2;
  return undefined;
}

/** DeepSeek charges double on weekdays 01:00–04:00 and 06:00–10:00 UTC. */
export function deepseekPeak(at: Date): boolean {
  const day = at.getUTCDay();
  const hour = at.getUTCHours();
  return day >= 1 && day <= 5 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
}

/** Estimated spend in USD from the configured per-million-token prices. */
export function estimateCost(
  usage: Pick<LanguageModelUsage, "inputTokens" | "outputTokens"> | undefined,
  settings: Pick<BotSettings["ai"], "provider" | "inputPricePerMillion" | "outputPricePerMillion">,
  at = new Date(),
): number {
  const input = usage?.inputTokens ?? 0;
  const output = usage?.outputTokens ?? 0;
  const factor = settings.provider === "deepseek" && deepseekPeak(at) ? 2 : 1;
  const cost = ((input / 1_000_000) * settings.inputPricePerMillion + (output / 1_000_000) * settings.outputPricePerMillion) * factor;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

const MINUTE = 60_000;

/**
 * Errors after which every further call to the provider would fail too: no credit or quota left, a refused key,
 * a rate limit. The bot pauses instead of using up the items' attempts; other errors fail just the item.
 */
export function providerRefusal(error: unknown): Pick<AiPause, "kind" | "message"> & { retryAfterMs: number } | null {
  const inner = RetryError.isInstance(error) ? error.lastError : error;
  if (!APICallError.isInstance(inner)) return null;
  const status = inner.statusCode ?? 0;
  const message = inner.message.slice(0, 300);
  const text = `${inner.message} ${inner.responseBody ?? ""}`.toLowerCase();
  if (status === 401 || status === 403) return { kind: "auth", message, retryAfterMs: 30 * MINUTE };
  if (status === 402 || (status === 429 && /quota|billing|credit|balance|insufficient/.test(text))) {
    return { kind: "quota", message, retryAfterMs: 60 * MINUTE };
  }
  if (status === 429) {
    const seconds = Number(inner.responseHeaders?.["retry-after"]);
    return { kind: "rate_limit", message, retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 30 * MINUTE) : 2 * MINUTE };
  }
  return null;
}

/**
 * Logs AI SDK warnings once each. The notice that DeepSeek receives the JSON schema in the prompt (it has no
 * strict schema mode) is expected on every call and dropped.
 */
export function installAiWarningLogger(log: (message: string) => void) {
  const seen = new Set<string>();
  globalThis.AI_SDK_LOG_WARNINGS = ({ warnings, provider, model }) => {
    for (const warning of warnings) {
      if (warning.type === "compatibility" && warning.feature === "responseFormat JSON schema") continue;
      const text = `${provider ?? "ai"} / ${model ?? "?"}: ${JSON.stringify(warning)}`;
      if (seen.has(text)) continue;
      seen.add(text);
      log(`AI SDK warning ${text}`);
    }
  };
}
