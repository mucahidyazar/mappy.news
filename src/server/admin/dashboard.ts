import "server-only";

import { and, asc, desc, eq, gte, isNotNull, min, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { sqlTimestamp } from "@/lib/db/sql";
import { auditLogs, categories, comments, news, user, verifications } from "@/lib/db/schema";

export async function getDashboard() {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const since14d = new Date(Date.now() - 14 * 24 * 3600 * 1000);

  const [[counts], [people], daily, recent, mapRows, [oldest], casualtyRows] = await Promise.all([
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
    // The desk map: everything waiting for an editor and what went out this week, oldest first.
    db
      .select({
        id: news.id,
        title: news.title,
        status: news.status,
        latitude: news.publicLatitude,
        longitude: news.publicLongitude,
        color: categories.color,
        at: sql<Date>`coalesce(${news.publishedAt}, ${news.createdAt})`.mapWith(news.createdAt),
      })
      .from(news)
      .innerJoin(categories, eq(news.categoryId, categories.id))
      .where(
        and(
          isNotNull(news.publicLatitude),
          isNotNull(news.publicLongitude),
          or(eq(news.status, "pending"), and(eq(news.status, "published"), gte(news.publishedAt, since7d))),
        ),
      )
      .orderBy(asc(sql`coalesce(${news.publishedAt}, ${news.createdAt})`))
      .limit(600),
    db.select({ at: min(news.createdAt) }).from(news).where(eq(news.status, "pending")),
    // Killed and injured in published incidents of the week: every incident once, at the highest toll any of its
    // published reports gives.
    db.execute<{ key: string; nameTr: string; nameEn: string; color: string; incidents: number; deaths: number; injured: number; deaths24h: number; injured24h: number }>(sql`
      with incidents as (
        select ${categories.key} as key, ${categories.nameTr} as name_tr, ${categories.nameEn} as name_en, ${categories.color} as color,
          ${news.occurredAt} as occurred_at,
          greatest(${news.deaths}, max(follow_up.deaths)) as deaths,
          greatest(${news.injured}, max(follow_up.injured)) as injured
        from ${news}
        join ${categories} on ${categories.id} = ${news.categoryId}
        left join ${news} as follow_up on follow_up.parent_id = ${news.id} and follow_up.status = 'published'
        where ${news.status} = 'published' and ${news.parentId} is null and ${news.occurredAt} >= ${sqlTimestamp(since7d)}
        group by ${news.id}, ${categories.id}
      )
      select key, name_tr as "nameTr", name_en as "nameEn", color,
        (count(*) filter (where coalesce(deaths, 0) + coalesce(injured, 0) > 0))::int as incidents,
        coalesce(sum(deaths), 0)::int as deaths,
        coalesce(sum(injured), 0)::int as injured,
        coalesce(sum(deaths) filter (where occurred_at >= ${sqlTimestamp(since24h)}), 0)::int as "deaths24h",
        coalesce(sum(injured) filter (where occurred_at >= ${sqlTimestamp(since24h)}), 0)::int as "injured24h"
      from incidents
      group by key, name_tr, name_en, color
      having coalesce(sum(deaths), 0) + coalesce(sum(injured), 0) > 0
      order by sum(deaths) desc nulls last, sum(injured) desc nulls last
    `),
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

  const byCategory = [...casualtyRows].map((row) => ({ ...row, incidents: Number(row.incidents), deaths: Number(row.deaths), injured: Number(row.injured) }));
  const casualties = {
    deaths: byCategory.reduce((sum, row) => sum + row.deaths, 0),
    injured: byCategory.reduce((sum, row) => sum + row.injured, 0),
    incidents: byCategory.reduce((sum, row) => sum + row.incidents, 0),
    deaths24h: byCategory.reduce((sum, row) => sum + Number(row.deaths24h), 0),
    injured24h: byCategory.reduce((sum, row) => sum + Number(row.injured24h), 0),
    byCategory: byCategory.map(({ key, nameTr, nameEn, color, deaths, injured }) => ({ key, nameTr, nameEn, color, deaths, injured })),
  };

  return {
    casualties,
    counts: counts ?? { pendingUser: 0, pendingBot: 0, published24h: 0, published7d: 0, publishedTotal: 0, pendingVerifications: 0, comments24h: 0 },
    people: people ?? { total: 0, new7d: 0 },
    days,
    recent: recent.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    mapPoints: mapRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status === "pending" ? ("pending" as const) : ("published" as const),
      latitude: row.latitude!,
      longitude: row.longitude!,
      color: row.color,
      at: row.at.toISOString(),
    })),
    oldestPendingAt: oldest?.at ? oldest.at.toISOString() : null,
  };
}
