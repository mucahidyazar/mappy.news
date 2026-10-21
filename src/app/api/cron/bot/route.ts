import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { aiKeysFromEnv } from "@/lib/bot/ai";
import { errorMessage } from "@/lib/bot/events";
import { collect, maintain, processPending } from "@/lib/bot/pipeline";
import { readBotSettings } from "@/lib/bot/settings";
import { WORKER_LOCK_KEY } from "@/lib/bot/status";
import { db, getSql } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { getWebGeocoder } from "@/server/geocoder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = serverEnv().CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * One bot pass for hosts that cannot keep the worker running (an external scheduler calls it with
 * `Authorization: Bearer $CRON_SECRET`). Skips when the worker holds the lock.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const connection = await getSql().reserve();
  try {
    const [lock] = await connection`select pg_try_advisory_lock(${WORKER_LOCK_KEY}) as locked`;
    if (!lock?.locked) return NextResponse.json({ skipped: "worker_running" });
    try {
      const settings = await readBotSettings(db);
      if (!settings.enabled) return NextResponse.json({ skipped: "disabled" });
      const signal = AbortSignal.timeout(50_000);
      const context = { db, settings, geocoder: getWebGeocoder(), keys: aiKeysFromEnv(), xToken: process.env.X_BEARER_TOKEN || undefined, signal };
      const collected = await collect(context, { limit: 10 });
      const processed = await processPending(context, { limit: settings.ai.concurrency * 3 });
      const maintenance = new URL(request.url).searchParams.get("maintain") === "1" ? await maintain(context) : null;
      return NextResponse.json({ collected, processed, maintenance });
    } finally {
      await connection`select pg_advisory_unlock(${WORKER_LOCK_KEY})`;
    }
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  } finally {
    connection.release();
  }
}
