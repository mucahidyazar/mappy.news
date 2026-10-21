import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { botItems, news, verifications } from "@/lib/db/schema";

/** Counts shown next to sidebar entries. */
export async function getAdminBadges() {
  const [row] = await db
    .select({
      pendingNews: sql<number>`(select count(*)::int from ${news} where ${news.status} = 'pending')`,
      pendingVerifications: sql<number>`(select count(*)::int from ${verifications} where ${verifications.status} = 'pending')`,
      failedItems: sql<number>`(select count(*)::int from ${botItems} where ${botItems.status} = 'failed')`,
    })
    .from(sql`(select 1) as one`);
  return row ?? { pendingNews: 0, pendingVerifications: 0, failedItems: 0 };
}

export async function countPendingNews() {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(news).where(eq(news.status, "pending"));
  return row?.count ?? 0;
}
