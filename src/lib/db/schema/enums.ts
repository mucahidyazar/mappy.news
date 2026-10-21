import { pgEnum } from "drizzle-orm/pg-core";

import {
  BOT_ITEM_STATUSES,
  COMMENT_STATUSES,
  LOCATION_PRECISIONS,
  NEWS_ORIGINS,
  NEWS_RELATIONS,
  NEWS_STATUSES,
  POINT_ACTIONS,
  SOURCE_KINDS,
  SOURCE_TRUST_LEVELS,
  VERIFICATION_STATUSES,
} from "../../domain/constants";

export const newsStatus = pgEnum("news_status", NEWS_STATUSES);
export const newsOrigin = pgEnum("news_origin", NEWS_ORIGINS);
export const newsRelation = pgEnum("news_relation", NEWS_RELATIONS);
export const locationPrecision = pgEnum("location_precision", LOCATION_PRECISIONS);
export const sourceKind = pgEnum("source_kind", SOURCE_KINDS);
export const sourceTrust = pgEnum("source_trust", SOURCE_TRUST_LEVELS);
export const commentStatus = pgEnum("comment_status", COMMENT_STATUSES);
export const verificationStatus = pgEnum("verification_status", VERIFICATION_STATUSES);
export const pointAction = pgEnum("point_action", POINT_ACTIONS);
export const botItemStatus = pgEnum("bot_item_status", BOT_ITEM_STATUSES);
