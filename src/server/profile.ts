import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { account, categories, news, pointTransactions, user, userProfiles, verifications } from "@/lib/db/schema";

export async function getProfileSummary(userId: string) {
  await db.insert(userProfiles).values({ userId }).onConflictDoNothing();
  const [row] = await db
    .select({
      points: userProfiles.points,
      reportCount: userProfiles.reportCount,
      publishedReportCount: userProfiles.publishedReportCount,
      verificationCount: userProfiles.verificationCount,
      commentCount: userProfiles.commentCount,
      memberSince: user.createdAt,
    })
    .from(userProfiles)
    .innerJoin(user, eq(user.id, userProfiles.userId))
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  const [{ position } = { position: 0 }] = await db
    .select({ position: sql<number>`count(*)::int + 1` })
    .from(userProfiles)
    .where(sql`${userProfiles.points} > ${row?.points ?? 0}`);
  const [credential] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  return {
    points: row?.points ?? 0,
    reportCount: row?.reportCount ?? 0,
    publishedReportCount: row?.publishedReportCount ?? 0,
    verificationCount: row?.verificationCount ?? 0,
    commentCount: row?.commentCount ?? 0,
    memberSince: (row?.memberSince ?? new Date()).toISOString(),
    position,
    hasPassword: Boolean(credential),
  };
}

export async function listMyReports(userId: string, limit = 50) {
  const rows = await db
    .select({
      id: news.id,
      slug: news.slug,
      title: news.title,
      status: news.status,
      rejectionReason: news.rejectionReason,
      createdAt: news.createdAt,
      locationLabel: news.locationLabel,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(news)
    .innerJoin(categories, eq(news.categoryId, categories.id))
    .where(and(eq(news.submittedById, userId), eq(news.origin, "user")))
    .orderBy(desc(news.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function listMyVerifications(userId: string, limit = 50) {
  const rows = await db
    .select({
      id: verifications.id,
      address: verifications.address,
      status: verifications.status,
      reviewNote: verifications.reviewNote,
      pointsAwarded: verifications.pointsAwarded,
      createdAt: verifications.createdAt,
      newsTitle: news.title,
      newsSlug: news.slug,
    })
    .from(verifications)
    .innerJoin(news, eq(verifications.newsId, news.id))
    .where(eq(verifications.userId, userId))
    .orderBy(desc(verifications.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function listPointHistory(userId: string, limit = 50) {
  const rows = await db
    .select({
      id: pointTransactions.id,
      action: pointTransactions.action,
      amount: pointTransactions.amount,
      balanceAfter: pointTransactions.balanceAfter,
      createdAt: pointTransactions.createdAt,
    })
    .from(pointTransactions)
    .where(eq(pointTransactions.userId, userId))
    .orderBy(desc(pointTransactions.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getLeaderboard(limit = 50) {
  return db
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      points: userProfiles.points,
      publishedReportCount: userProfiles.publishedReportCount,
      verificationCount: userProfiles.verificationCount,
    })
    .from(userProfiles)
    .innerJoin(user, eq(user.id, userProfiles.userId))
    .where(and(sql`${userProfiles.points} > 0`, eq(user.banned, false)))
    .orderBy(desc(userProfiles.points), user.createdAt)
    .limit(limit);
}
