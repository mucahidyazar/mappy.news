import {
  bigserial,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { BotAnalysis, GeocodeResult, NewsMedia, ParentSuggestion } from "../../domain/types";

import { news, sources } from "./app";
import { botItemStatus, locationPrecision } from "./enums";

/** A post or feed entry collected by the news bot, kept until retention removes it. */
export const botItems = pgTable(
  "bot_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceId: uuid()
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: text().notNull(),
    url: text(),
    title: text(),
    body: text().notNull(),
    author: text(),
    publishedAt: timestamp({ withTimezone: true }),
    media: jsonb().$type<NewsMedia[]>().notNull().default([]),
    contentHash: text().notNull(),
    status: botItemStatus().notNull().default("new"),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Lease: a worker that crashed mid-item gives it back when this passes. */
    lockedUntil: timestamp({ withTimezone: true }),
    lastError: text(),
    rejectionReason: text(),
    analysis: jsonb().$type<BotAnalysis>(),
    geocode: jsonb().$type<GeocodeResult | null>(),
    parentSuggestion: jsonb().$type<ParentSuggestion | null>(),
    newsId: uuid().references(() => news.id, { onDelete: "set null" }),
    processedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("bot_items_source_external_key").on(t.sourceId, t.externalId),
    index("bot_items_queue_idx").on(t.status, t.nextAttemptAt),
    index("bot_items_created_idx").on(t.createdAt.desc()),
    index("bot_items_hash_idx").on(t.contentHash),
  ],
);

/**
 * Append-only log of everything the bot does. An insert trigger NOTIFYs `mappy_bot`, which feeds the live
 * admin view; the same rows give the daily AI spend.
 */
export const botEvents = pgTable(
  "bot_events",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    level: text().notNull().default("info"),
    code: text().notNull(),
    message: text(),
    sourceId: uuid(),
    itemId: uuid(),
    newsId: uuid(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    model: text(),
    inputTokens: integer(),
    outputTokens: integer(),
    costUsd: numeric({ precision: 12, scale: 6, mode: "number" }),
    durationMs: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bot_events_created_idx").on(t.createdAt.desc()),
    index("bot_events_item_idx").on(t.itemId),
    index("bot_events_code_created_idx").on(t.code, t.createdAt.desc()),
  ],
);

/** Nominatim answers, hits and misses, so the public geocoder is asked once per place. */
export const geocodeCache = pgTable("geocode_cache", {
  queryKey: text().primaryKey(),
  query: text().notNull(),
  provider: text().notNull(),
  latitude: doublePrecision(),
  longitude: doublePrecision(),
  displayName: text(),
  precision: locationPrecision(),
  /** Every candidate of the answer; the columns above describe the first one. */
  result: jsonb().$type<GeocodeResult[]>().notNull().default([]),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});
