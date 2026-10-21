import "server-only";

import { desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { sqlTimestamp } from "@/lib/db/sql";
import { auditLogs, comments, news, user, verifications } from "@/lib/db/schema";

export async function getDashboard() {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const since14d = new Date(Date.now() - 14 * 24 * 3600 * 1000);

  const [[counts], [people], daily, recent] = await Promise.all([
    db
      .select({
        pendingUser: sql<number>`count(*) filter (where ${news.status} = 'pending' and ${news.origin} = 'user')::int`,
        pendingBot: sql<number>`count(*) filter (where ${news.status} = 'pending' and ${news.origin} = 'bot')::int`,
        published24h: sql<number>`count(*) filter (where ${news.status} = 'published' and ${news.publishedAt} >= ${sqlTimestamp(since24h)})::int`,
        published7d: sql<number>`count(*) filter (where ${news.status} = 'published' and ${news.publishedAt} >= ${sqlTimestamp(since7d)})::int`,
        publishedTotal: sql<number>`count(*) filter (where ${news.status} = 'published')::int`,
        pendingVerifications: sql<number>`(select count(*)::int from ${verifications} where ${verifications.status} = 'pending')`,
        comments24h: sql<number>`(select count(*)::int from ${comments} where ${comments.createdAt} >= ${sqlTimestamp(since24h)})`,
      })
      .from(news),
    db
      .select({
        total: sql<number>`count(*)::int`,
        new7d: sql<number>`count(*) filter (where ${user.createdAt} >= ${sqlTimestamp(since7d)})::int`,
      })
      .from(user),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${news.publishedAt} at time zone 'Europe/Istanbul'), 'YYYY-MM-DD')`,
        origin: news.origin,
        count: sql<number>`count(*)::int`,
      })
      .from(news)
      .where(sql`${news.status} = 'published' and ${news.publishedAt} >= ${sqlTimestamp(since14d)}`)
      .groupBy(sql`1`, news.origin),
    db
      .select({ id: auditLogs.id, action: auditLogs.action, targetType: auditLogs.targetType, targetId: auditLogs.targetId, createdAt: auditLogs.createdAt, actorName: user.name })
      .from(auditLogs)
      .leftJoin(user, eq(auditLogs.actorId, user.id))
      .where(gte(auditLogs.createdAt, since14d))
      .orderBy(desc(auditLogs.createdAt))
      .limit(8),
  ]);

  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.now() - (13 - index) * 24 * 3600 * 1000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(date);
    const rows = daily.filter((row) => row.day === key);
    return {
      day: key,
      user: rows.find((row) => row.origin === "user")?.count ?? 0,
      bot: rows.find((row) => row.origin === "bot")?.count ?? 0,
      admin: rows.find((row) => row.origin === "admin")?.count ?? 0,
    };
  });

  return {
    counts: counts ?? { pendingUser: 0, pendingBot: 0, published24h: 0, published7d: 0, publishedTotal: 0, pendingVerifications: 0, comments24h: 0 },
    people: people ?? { total: 0, new7d: 0 },
    days,
    recent: recent.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  };
}
