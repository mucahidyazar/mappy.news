/**
 * Domain vocabularies shared by the database enums, validation schemas, the UI and the news bot.
 * Keep this file free of imports so client components can use it.
 */

export const NEWS_STATUSES = ["pending", "published", "rejected", "archived"] as const;
export type NewsStatus = (typeof NEWS_STATUSES)[number];

/** Who created the story: a signed-in reporter, the news bot or an editor in the admin panel. */
export const NEWS_ORIGINS = ["user", "bot", "admin"] as const;
export type NewsOrigin = (typeof NEWS_ORIGINS)[number];

/** How a follow-up story relates to the story it continues. */
export const NEWS_RELATIONS = ["update", "correction", "development"] as const;
export type NewsRelation = (typeof NEWS_RELATIONS)[number];

/** Ordered from most to least precise. */
export const LOCATION_PRECISIONS = [
  "exact",
  "street",
  "neighborhood",
  "district",
  "city",
  "region",
  "country",
  "unknown",
] as const;
export type LocationPrecision = (typeof LOCATION_PRECISIONS)[number];

export const SOURCE_KINDS = ["rss", "x", "web"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * official: public institutions (AFAD, governorships, police, fire brigade).
 * media: news outlets and agencies. community: local pages and citizen accounts.
 */
export const SOURCE_TRUST_LEVELS = ["official", "media", "community"] as const;
export type SourceTrust = (typeof SOURCE_TRUST_LEVELS)[number];

export const COMMENT_STATUSES = ["visible", "hidden"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const VERIFICATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const POINT_ACTIONS = [
  "report_published",
  "verification_approved",
  "comment_posted",
  "comment_removed",
  "bonus",
  "penalty",
] as const;
export type PointAction = (typeof POINT_ACTIONS)[number];

/**
 * new → processing → (screened_out | rejected | duplicate | queued | published | failed).
 * queued: a pending story waits in the review queue. published: the bot published it on its own.
 */
export const BOT_ITEM_STATUSES = [
  "new",
  "processing",
  "screened_out",
  "rejected",
  "duplicate",
  "queued",
  "published",
  "failed",
] as const;
export type BotItemStatus = (typeof BOT_ITEM_STATUSES)[number];

export const USER_ROLES = ["user", "moderator", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const POINTS = {
  reportPublished: 25,
  verificationApproved: 50,
  commentPosted: 2,
} as const;

/** Comments that earn points per day; more comments are allowed but give nothing. */
export const DAILY_COMMENT_POINT_LIMIT = 10;
