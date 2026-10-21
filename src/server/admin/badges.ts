import "server-only";

import { eq, sql } from "drizzle-orm";

import type { SidebarBotState } from "@/components/admin/nav";
import { readBotSettings } from "@/lib/bot/settings";
import { readWorkerStatus } from "@/lib/bot/status";
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

/** The bot line at the bottom of the sidebar: running, paused (switched off) or offline (no heartbeat). */
export async function getSidebarBot(): Promise<SidebarBotState> {
  const [worker, settings] = await Promise.all([readWorkerStatus(db), readBotSettings(db)]);
  const state = !worker?.online ? "offline" : settings.enabled ? "running" : "paused";
  return { state, heartbeatAt: worker?.heartbeatAt ?? null };
}
