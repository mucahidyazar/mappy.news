import { relations } from "drizzle-orm";

import {
  categories,
  comments,
  news,
  newsCitations,
  pointTransactions,
  sources,
  userBans,
  userProfiles,
  verifications,
} from "./app";
import { account, session, user } from "./auth";
import { botItems } from "./bot";

export const userRelations = relations(user, ({ one, many }) => ({
  profile: one(userProfiles, { fields: [user.id], references: [userProfiles.userId] }),
  sessions: many(session),
  accounts: many(account),
  comments: many(comments),
  verifications: many(verifications, { relationName: "verificationAuthor" }),
  submittedNews: many(news, { relationName: "submittedBy" }),
  pointTransactions: many(pointTransactions),
  bans: many(userBans, { relationName: "bannedUser" }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const userProfileRelations = relations(userProfiles, ({ one }) => ({
  user: one(user, { fields: [userProfiles.userId], references: [user.id] }),
}));

export const categoryRelations = relations(categories, ({ many }) => ({
  news: many(news),
}));

export const sourceRelations = relations(sources, ({ many }) => ({
  news: many(news),
  items: many(botItems),
}));

export const newsRelations = relations(news, ({ one, many }) => ({
  category: one(categories, { fields: [news.categoryId], references: [categories.id] }),
  source: one(sources, { fields: [news.sourceId], references: [sources.id] }),
  parent: one(news, { fields: [news.parentId], references: [news.id], relationName: "followUps" }),
  followUps: many(news, { relationName: "followUps" }),
  suggestedParent: one(news, {
    fields: [news.suggestedParentId],
    references: [news.id],
    relationName: "suggestedParent",
  }),
  submittedBy: one(user, { fields: [news.submittedById], references: [user.id], relationName: "submittedBy" }),
  reviewedBy: one(user, { fields: [news.reviewedById], references: [user.id], relationName: "reviewedBy" }),
  citations: many(newsCitations),
  comments: many(comments),
  verifications: many(verifications),
}));

export const newsCitationRelations = relations(newsCitations, ({ one }) => ({
  news: one(news, { fields: [newsCitations.newsId], references: [news.id] }),
  source: one(sources, { fields: [newsCitations.sourceId], references: [sources.id] }),
}));

export const commentRelations = relations(comments, ({ one }) => ({
  news: one(news, { fields: [comments.newsId], references: [news.id] }),
  user: one(user, { fields: [comments.userId], references: [user.id] }),
}));

export const verificationRelations = relations(verifications, ({ one }) => ({
  news: one(news, { fields: [verifications.newsId], references: [news.id] }),
  user: one(user, {
    fields: [verifications.userId],
    references: [user.id],
    relationName: "verificationAuthor",
  }),
  reviewedBy: one(user, {
    fields: [verifications.reviewedById],
    references: [user.id],
    relationName: "verificationReviewer",
  }),
}));

export const pointTransactionRelations = relations(pointTransactions, ({ one }) => ({
  user: one(user, { fields: [pointTransactions.userId], references: [user.id] }),
}));

export const userBanRelations = relations(userBans, ({ one }) => ({
  user: one(user, { fields: [userBans.userId], references: [user.id], relationName: "bannedUser" }),
  bannedBy: one(user, { fields: [userBans.bannedById], references: [user.id], relationName: "bannedByUser" }),
}));

export const botItemRelations = relations(botItems, ({ one }) => ({
  source: one(sources, { fields: [botItems.sourceId], references: [sources.id] }),
  news: one(news, { fields: [botItems.newsId], references: [news.id] }),
}));
