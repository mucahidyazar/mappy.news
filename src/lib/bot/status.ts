import { eq } from "drizzle-orm";

import { appSettings } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/types";

import { BOT_STATUS_KEY, type WorkerStatus } from "./settings";

export const CONTROL_CHANNEL = "mappy_bot_control";
export const EVENTS_CHANNEL = "mappy_bot";
/** Advisory lock key held by the single active worker ("mappynws" in hex-ish digits). */
export const WORKER_LOCK_KEY = 7_270_919_001;
/** A heartbeat older than this means the worker is offline. */
export const HEARTBEAT_STALE_MS = 90_000;

export async function writeWorkerStatus(db: DbExecutor, status: WorkerStatus) {
  await db
    .insert(appSettings)
    .values({ key: BOT_STATUS_KEY, value: status })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: status, updatedAt: new Date() } });
}

export async function readWorkerStatus(db: DbExecutor): Promise<(WorkerStatus & { online: boolean }) | null> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, BOT_STATUS_KEY)).limit(1);
  if (!row?.value || typeof row.value !== "object") return null;
  const status = row.value as WorkerStatus;
  const online = Date.now() - new Date(status.heartbeatAt).getTime() < HEARTBEAT_STALE_MS && status.state !== "stopping";
  return { ...status, online };
}
