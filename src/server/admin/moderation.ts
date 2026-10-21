import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, or, type SQL, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { auditLogs, categories, comments, news, user, userBans, userProfiles, verifications } from "@/lib/db/schema";
import type { CommentStatus, VerificationStatus } from "@/lib/domain/constants";

import { escapeLike } from "../news/public";

export const PAGE_SIZE = 25;

export async function listVerificationsForReview(status: VerificationStatus, page: number) {
  const where = eq(verifications.status, status);
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: verifications.id,
        address: verifications.address,
        latitude: verifications.latitude,
        longitude: verifications.longitude,
        note: verifications.note,
        evidenceUrls: verifications.evidenceUrls,
        status: verifications.status,
        reviewNote: verifications.reviewNote,
        createdAt: verifications.createdAt,
        newsId: news.id,
        newsSlug: news.slug,
        newsTitle: news.title,
        newsLocation: news.locationLabel,
        newsPrecision: news.precision,
        newsLatitude: news.latitude,
        newsLongitude: news.longitude,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userPoints: userProfiles.points,
      })
      .from(verifications)
      .innerJoin(news, eq(verifications.newsId, news.id))
      .innerJoin(user, eq(verifications.userId, user.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
      .where(where)
      .orderBy(status === "pending" ? asc(verifications.createdAt) : desc(verifications.reviewedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ count: count() }).from(verifications).where(where),
  ]);
  return {
    total: total?.count ?? 0,
    items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), userPoints: row.userPoints ?? 0 })),
  };
}

export async function listCommentsForModeration(filters: { status?: CommentStatus; q?: string; page: number }) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(comments.status, filters.status));
  if (filters.q) conditions.push(ilike(comments.body, `%${escapeLike(filters.q)}%`));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: comments.id,
        body: comments.body,
        status: comments.status,
        hiddenReason: comments.hiddenReason,
        createdAt: comments.createdAt,
        newsId: news.id,
        newsSlug: news.slug,
        newsTitle: news.title,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
      })
      .from(comments)
      .innerJoin(news, eq(comments.newsId, news.id))
      .innerJoin(user, eq(comments.userId, user.id))
      .where(where)
      .orderBy(desc(comments.createdAt))
      .limit(PAGE_SIZE)
      .offset((filters.page - 1) * PAGE_SIZE),
    db.select({ count: count() }).from(comments).where(where),
  ]);
  return { total: total?.count ?? 0, items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
}

export async function listUsersForAdmin(filters: { q?: string; role?: string; banned?: boolean; page: number }) {
  const conditions: SQL[] = [];
  if (filters.q) {
    const term = `%${escapeLike(filters.q)}%`;
    conditions.push(or(ilike(user.name, term), ilike(user.email, term))!);
  }
  if (filters.role) conditions.push(eq(user.role, filters.role));
  if (filters.banned !== undefined) conditions.push(eq(user.banned, filters.banned));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        emailVerified: user.emailVerified,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        createdAt: user.createdAt,
        points: userProfiles.points,
        reportCount: userProfiles.reportCount,
        publishedReportCount: userProfiles.publishedReportCount,
        commentCount: userProfiles.commentCount,
      })
      .from(user)
      .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(PAGE_SIZE)
      .offset((filters.page - 1) * PAGE_SIZE),
    db.select({ count: count() }).from(user).where(where),
  ]);
  return {
    total: total?.count ?? 0,
    items: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      banExpires: row.banExpires?.toISOString() ?? null,
      points: row.points ?? 0,
      reportCount: row.reportCount ?? 0,
      publishedReportCount: row.publishedReportCount ?? 0,
      commentCount: row.commentCount ?? 0,
    })),
  };
}

/** Ban history of several users at once, newest first, keyed by user id. */
export async function getBanHistories(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, ReturnType<typeof toEntry>[]>();
  const bannedBy = sql<string | null>`(select u.name from "user" u where u.id = ${userBans.bannedById})`;
  const rows = await db
    .select({
      id: userBans.id,
      userId: userBans.userId,
      reason: userBans.reason,
      createdAt: userBans.createdAt,
      expiresAt: userBans.expiresAt,
      liftedAt: userBans.liftedAt,
      bannedByName: bannedBy,
    })
    .from(userBans)
    .where(inArray(userBans.userId, userIds))
    .orderBy(desc(userBans.createdAt));
  const result = new Map<string, ReturnType<typeof toEntry>[]>();
  for (const row of rows) result.set(row.userId, [...(result.get(row.userId) ?? []), toEntry(row)]);
  return result;
}

function toEntry(row: { id: string; reason: string; createdAt: Date; expiresAt: Date | null; liftedAt: Date | null; bannedByName: string | null }) {
  return {
    id: row.id,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    liftedAt: row.liftedAt?.toISOString() ?? null,
    bannedByName: row.bannedByName,
  };
}

export async function listCategoriesWithCounts() {
  return db
    .select({
      id: categories.id,
      key: categories.key,
      nameTr: categories.nameTr,
      nameEn: categories.nameEn,
      aiHint: categories.aiHint,
      color: categories.color,
      icon: categories.icon,
      isSensitive: categories.isSensitive,
      isActive: categories.isActive,
      sortOrder: categories.sortOrder,
      newsCount: sql<number>`(select count(*)::int from ${news} where ${news.categoryId} = ${categories.id})`,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.nameTr));
}

export async function listAuditLogs(page: number) {
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        data: auditLogs.data,
        createdAt: auditLogs.createdAt,
        actorName: user.name,
        actorEmail: user.email,
      })
      .from(auditLogs)
      .leftJoin(user, eq(auditLogs.actorId, user.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ count: count() }).from(auditLogs),
  ]);
  return { total: total?.count ?? 0, items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
}
