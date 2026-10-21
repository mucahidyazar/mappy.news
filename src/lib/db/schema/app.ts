import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { BotAnalysis, NewsMedia, SourceCursor } from "../../domain/types";

import { user } from "./auth";
import {
  commentStatus,
  locationPrecision,
  newsOrigin,
  newsRelation,
  newsStatus,
  pointAction,
  sourceKind,
  sourceTrust,
  verificationStatus,
} from "./enums";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const categories = pgTable("categories", {
  id: uuid().primaryKey().defaultRandom(),
  key: text().notNull().unique(),
  nameTr: text().notNull(),
  nameEn: text().notNull(),
  /** Guidance for the news bot: what belongs in this category. */
  aiHint: text(),
  color: text().notNull(),
  icon: text().notNull(),
  /** Stories in a sensitive category never disclose more than neighborhood level on the public map. */
  isSensitive: boolean().notNull().default(false),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Where stories come from: an RSS/Atom feed, an X account, or a website that is only cited.
 * Polling fields are used by the news bot; a `web` source is never polled.
 */
export const sources = pgTable(
  "sources",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: sourceKind().notNull(),
    name: text().notNull(),
    /** X handle without "@", lowercase. */
    handle: text(),
    /** Feed URL for RSS, profile URL for X, homepage for web. */
    url: text(),
    homepageUrl: text(),
    logoUrl: text(),
    description: text(),
    trust: sourceTrust().notNull().default("media"),
    isActive: boolean().notNull().default(true),
    pollIntervalMinutes: integer().notNull().default(15),
    maxItemsPerPoll: integer().notNull().default(20),
    /** The bot may publish this source's stories without review when they pass the auto-publish thresholds. */
    autoPublish: boolean().notNull().default(false),
    /** Optional keywords; when set, only posts containing one of them are analysed. */
    keywordFilter: text().array().notNull().default(sql`'{}'::text[]`),
    externalId: text(),
    cursor: jsonb().$type<SourceCursor>().notNull().default({}),
    nextPollAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastPolledAt: timestamp({ withTimezone: true }),
    lastSuccessAt: timestamp({ withTimezone: true }),
    failStreak: integer().notNull().default(0),
    lastError: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sources_kind_handle_key").on(t.kind, t.handle).where(sql`${t.handle} is not null`),
    uniqueIndex("sources_kind_url_key").on(t.kind, t.url).where(sql`${t.url} is not null and ${t.kind} <> 'x'`),
    index("sources_due_idx").on(t.isActive, t.nextPollAt),
  ],
);

export const news = pgTable(
  "news",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    status: newsStatus().notNull().default("pending"),
    origin: newsOrigin().notNull(),
    title: text().notNull(),
    summary: text(),
    content: text(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),

    /** Display label, e.g. "Kadıköy, İstanbul". */
    locationLabel: text().notNull(),
    /** The location as written in the source. */
    locationMention: text(),
    province: text(),
    district: text(),
    neighborhood: text(),
    street: text(),
    precision: locationPrecision().notNull().default("unknown"),
    locationConfidence: real(),
    /** Best known coordinates. Never sent to visitors directly; see public* below. */
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    /** What the public map shows: coarsened for sensitive stories. */
    publicLatitude: doublePrecision(),
    publicLongitude: doublePrecision(),
    publicPrecision: locationPrecision().notNull().default("unknown"),
    locationNotes: text(),

    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp({ withTimezone: true }),

    sourceId: uuid().references(() => sources.id, { onDelete: "set null" }),
    sourceUrl: text(),
    sourceExternalId: text(),
    imageUrl: text(),
    media: jsonb().$type<NewsMedia[]>().notNull().default([]),

    editorialScore: real(),
    editorialConfidence: real(),
    isSensitive: boolean().notNull().default(false),
    sensitivityType: text(),
    isFeatured: boolean().notNull().default(false),
    aiAnalysis: jsonb().$type<BotAnalysis>(),
    dedupeKey: text().unique(),

    parentId: uuid().references((): AnyPgColumn => news.id, { onDelete: "set null" }),
    relation: newsRelation(),
    suggestedParentId: uuid().references((): AnyPgColumn => news.id, { onDelete: "set null" }),
    suggestedParentConfidence: real(),
    suggestedParentReason: text(),

    submittedById: text().references(() => user.id, { onDelete: "set null" }),
    reviewedById: text().references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp({ withTimezone: true }),
    reviewNote: text(),
    rejectionReason: text(),

    viewCount: integer().notNull().default(0),
    commentCount: integer().notNull().default(0),
    citationCount: integer().notNull().default(0),
    /** Lowercased, Turkish-folded title, summary and place names for search. */
    searchText: text().notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("news_status_occurred_idx").on(t.status, t.occurredAt.desc()),
    index("news_status_created_idx").on(t.status, t.createdAt.desc()),
    index("news_public_position_idx").on(t.publicLatitude, t.publicLongitude),
    index("news_category_idx").on(t.categoryId),
    index("news_parent_idx").on(t.parentId),
    index("news_source_external_idx").on(t.sourceId, t.sourceExternalId),
    index("news_submitted_by_idx").on(t.submittedById),
  ],
);

/** Every outlet or post that reported a story; the bot adds one when another source covers the same incident. */
export const newsCitations = pgTable(
  "news_citations",
  {
    id: uuid().primaryKey().defaultRandom(),
    newsId: uuid()
      .notNull()
      .references(() => news.id, { onDelete: "cascade" }),
    sourceId: uuid().references(() => sources.id, { onDelete: "set null" }),
    url: text().notNull(),
    title: text(),
    publisherName: text(),
    publishedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("news_citations_news_url_key").on(t.newsId, t.url)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    newsId: uuid()
      .notNull()
      .references(() => news.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text().notNull(),
    status: commentStatus().notNull().default("visible"),
    hiddenReason: text(),
    editedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("comments_news_created_idx").on(t.newsId, t.createdAt.desc()), index("comments_user_idx").on(t.userId)],
);

/** A reader confirming or refining where a story happened. Approval moves the story's location. */
export const verifications = pgTable(
  "verifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    newsId: uuid()
      .notNull()
      .references(() => news.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    address: text().notNull(),
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    note: text(),
    evidenceUrls: text().array().notNull().default(sql`'{}'::text[]`),
    status: verificationStatus().notNull().default("pending"),
    reviewedById: text().references(() => user.id, { onDelete: "set null" }),
    reviewNote: text(),
    reviewedAt: timestamp({ withTimezone: true }),
    pointsAwarded: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("verifications_news_user_key").on(t.newsId, t.userId),
    index("verifications_status_created_idx").on(t.status, t.createdAt),
  ],
);

export const userProfiles = pgTable("user_profiles", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  bio: text(),
  points: integer().notNull().default(0),
  reportCount: integer().notNull().default(0),
  publishedReportCount: integer().notNull().default(0),
  verificationCount: integer().notNull().default(0),
  commentCount: integer().notNull().default(0),
  preferredCategoryKeys: text().array().notNull().default(sql`'{}'::text[]`),
  homeLatitude: doublePrecision(),
  homeLongitude: doublePrecision(),
  homeLabel: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const pointTransactions = pgTable(
  "point_transactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: pointAction().notNull(),
    amount: integer().notNull(),
    balanceAfter: integer().notNull(),
    referenceId: text(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("point_transactions_reference_key").on(t.userId, t.action, t.referenceId),
    index("point_transactions_user_created_idx").on(t.userId, t.createdAt.desc()),
  ],
);

/** Ban history; the current ban state lives on the user row (Better Auth admin plugin). */
export const userBans = pgTable(
  "user_bans",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text().notNull(),
    bannedById: text().references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }),
    liftedAt: timestamp({ withTimezone: true }),
    liftedById: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("user_bans_user_idx").on(t.userId, t.createdAt.desc())],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt.desc()),
    index("audit_logs_target_idx").on(t.targetType, t.targetId),
  ],
);

/** Key/value settings edited in the admin panel (news bot configuration, worker heartbeat). */
export const appSettings = pgTable("app_settings", {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
  updatedById: text().references(() => user.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

/** Daily view de-duplication: one row per story, day and anonymous visitor hash. */
export const newsViews = pgTable(
  "news_views",
  {
    newsId: uuid()
      .notNull()
      .references(() => news.id, { onDelete: "cascade" }),
    day: text().notNull(),
    visitorHash: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.newsId, t.day, t.visitorHash] })],
);
