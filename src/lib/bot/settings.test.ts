import { describe, expect, it } from "vitest";

import { APICallError, RetryError } from "ai";

import { deepseekPeak, estimateCost, providerOptions, providerRefusal } from "./ai";
import { autoPublishActive, DEFAULT_BOT_SETTINGS, MODEL_CATALOG, parseBotSettings } from "./settings";

describe("bot settings", () => {
  it("starts switched off with review for every story", () => {
    expect(DEFAULT_BOT_SETTINGS).toMatchObject({ enabled: false, dryRun: false, autoPublish: { mode: "off" }, ai: { provider: "openai", model: "gpt-6-luna", effort: "low" } });
    const luna = MODEL_CATALOG.openai.find((model) => model.id === DEFAULT_BOT_SETTINGS.ai.model);
    expect([DEFAULT_BOT_SETTINGS.ai.inputPricePerMillion, DEFAULT_BOT_SETTINGS.ai.outputPricePerMillion]).toEqual([luna?.input, luna?.output]);
  });

  it("fills in sections missing from older stored values", () => {
    const settings = parseBotSettings({ enabled: true, ai: { provider: "anthropic", model: "claude-haiku-5-5" } });
    expect(settings.enabled).toBe(true);
    expect(settings.ai).toMatchObject({ provider: "anthropic", model: "claude-haiku-5-5", dailyBudgetUsd: 3 });
    expect(settings.review.minScore).toBe(0.45);
  });

  it("falls back to the defaults for invalid values", () => {
    expect(parseBotSettings({ ai: { provider: "unknown" } })).toEqual(DEFAULT_BOT_SETTINGS);
    expect(parseBotSettings(null)).toEqual(DEFAULT_BOT_SETTINGS);
  });

  it("turns auto-publishing off once it expires", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const settings = parseBotSettings({ autoPublish: { mode: "trusted", until: "2026-10-21T13:00:00Z" } });
    expect(autoPublishActive(settings, now)).toBe(true);
    expect(autoPublishActive(settings, new Date("2026-10-21T13:00:00Z"))).toBe(false);
    expect(autoPublishActive(DEFAULT_BOT_SETTINGS, now)).toBe(false);
  });

  it("estimates spend from the configured token prices", () => {
    expect(estimateCost({ inputTokens: 2_000, outputTokens: 500 }, DEFAULT_BOT_SETTINGS.ai)).toBe(0.00045);
    expect(estimateCost(undefined, DEFAULT_BOT_SETTINGS.ai)).toBe(0);
  });

  it("doubles DeepSeek prices at its peak hours", () => {
    const deepseek = { provider: "deepseek" as const, inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 };
    const tuesdayPeak = new Date("2026-10-20T07:30:00Z");
    const tuesdayEvening = new Date("2026-10-20T18:00:00Z");
    const sundayMorning = new Date("2026-10-18T07:30:00Z");
    expect([deepseekPeak(tuesdayPeak), deepseekPeak(tuesdayEvening), deepseekPeak(sundayMorning)]).toEqual([true, false, false]);
    expect(estimateCost({ inputTokens: 1_000_000, outputTokens: 0 }, deepseek, tuesdayPeak)).toBe(0.3);
    expect(estimateCost({ inputTokens: 1_000_000, outputTokens: 0 }, deepseek, tuesdayEvening)).toBe(0.15);
  });

  it("turns DeepSeek thinking off at the low reasoning level", () => {
    expect(providerOptions("deepseek", "low")).toEqual({ deepseek: { thinking: { type: "disabled" } } });
    expect(providerOptions("deepseek", "high")).toEqual({ deepseek: { thinking: { type: "enabled" }, reasoningEffort: "high" } });
    expect(providerOptions("openai", "medium")).toEqual({ openai: { reasoningEffort: "medium", store: false } });
  });
});

describe("providerRefusal", () => {
  const apiError = (statusCode: number, responseBody: string, responseHeaders?: Record<string, string>) =>
    new APICallError({ message: responseBody, url: "https://api.example/v1", requestBodyValues: {}, statusCode, responseBody, responseHeaders, isRetryable: statusCode === 429 });

  it("recognizes exhausted credit, refused keys and rate limits, also after the SDK's retries", () => {
    expect(providerRefusal(apiError(402, '{"error":{"message":"Insufficient Balance"}}'))).toMatchObject({ kind: "quota" });
    expect(providerRefusal(apiError(429, '{"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}'))).toMatchObject({ kind: "quota" });
    expect(providerRefusal(apiError(401, "Incorrect API key provided"))).toMatchObject({ kind: "auth" });
    expect(providerRefusal(apiError(429, "Rate limit reached", { "retry-after": "20" }))).toMatchObject({ kind: "rate_limit", retryAfterMs: 20_000 });
    const retried = new RetryError({ message: "Failed after 3 attempts", reason: "maxRetriesExceeded", errors: [apiError(429, "slow down"), apiError(402, "Insufficient Balance")] });
    expect(providerRefusal(retried)).toMatchObject({ kind: "quota" });
  });

  it("leaves other failures to the normal retry of the item", () => {
    expect(providerRefusal(apiError(500, "Internal error"))).toBeNull();
    expect(providerRefusal(apiError(400, "Invalid schema"))).toBeNull();
    expect(providerRefusal(new Error("socket hang up"))).toBeNull();
  });
});
