/**
 * mappy.news news bot worker.
 *
 *   pnpm worker            run continuously (one instance per database, enforced by an advisory lock)
 *   pnpm worker --once     one collect + process pass, then exit (cron, debugging)
 *
 * Three independent loops share the process: collecting sources, processing items (AI, geocoding,
 * de-duplication) and hourly maintenance, so a slow AI call never delays polling.
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { hostname } from "node:os";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { aiKeysFromEnv, installAiWarningLogger } from "@/lib/bot/ai";
import { emitEvent, errorMessage } from "@/lib/bot/events";
import { activePause, type BotContext, collect, maintain, type PassState, processPending, resumeWaitingItems } from "@/lib/bot/pipeline";
import { type BotSettings, readBotSettings, type WorkerState, type WorkerStatus } from "@/lib/bot/settings";
import { CONTROL_CHANNEL, WORKER_LOCK_KEY, writeWorkerStatus } from "@/lib/bot/status";
import * as schema from "@/lib/db/schema";
import { createGeocoder, createNominatimClient } from "@/lib/geo/geocoder";

const VERSION = process.env.SOURCE_COMMIT?.slice(0, 12) || "dev";
const COLLECT_EVERY_MS = 30_000;
const PROCESS_EVERY_MS = 8_000;
const MAINTAIN_EVERY_MS = 60 * 60_000;
const HEARTBEAT_EVERY_MS = 15_000;
const LOCK_RETRY_MS = 30_000;

function log(message: string, extra?: unknown) {
  const line = `[worker ${new Date().toISOString()}] ${message}`;
  if (extra === undefined) console.log(line);
  else console.log(line, extra);
}

async function main() {
  installAiWarningLogger(log);
  const once = process.argv.includes("--once");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const sql = postgres(url, {
    max: 6,
    idle_timeout: 60,
    connect_timeout: 15,
    onnotice: () => {},
    connection: { application_name: "mappy-news-worker", TimeZone: "UTC", statement_timeout: 60_000 },
  });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const geocoder = createGeocoder(
    db,
    createNominatimClient({ NOMINATIM_URL: process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org", GEOCODER_CONTACT_EMAIL: process.env.GEOCODER_CONTACT_EMAIL || undefined, APP_URL: appUrl }, 1_500),
  );
  const controller = new AbortController();
  const passState: PassState = {};
  let settings: BotSettings = await readBotSettings(db);

  const status: WorkerStatus = {
    state: "starting",
    instanceId: randomUUID(),
    host: hostname(),
    pid: process.pid,
    version: VERSION,
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    lastPassAt: null,
    lastPassMs: null,
    lastError: null,
    consecutiveFailures: 0,
  };

  const context = (): BotContext => ({
    db,
    settings,
    geocoder,
    keys: aiKeysFromEnv(),
    xToken: process.env.X_BEARER_TOKEN || undefined,
    signal: controller.signal,
    log,
  });

  async function heartbeat(state?: WorkerState) {
    if (state) status.state = state;
    status.heartbeatAt = new Date().toISOString();
    status.aiPause = activePause(passState, settings, new Date());
    await writeWorkerStatus(db, status).catch((error) => log("heartbeat failed", errorMessage(error)));
    if (process.env.WORKER_ALIVE_FILE) await writeFile(process.env.WORKER_ALIVE_FILE, status.heartbeatAt).catch(() => {});
  }

  async function runPass(kind: "collect" | "process", force = false) {
    settings = await readBotSettings(db);
    if (!settings.enabled && !force) {
      if (status.state !== "paused") await heartbeat("paused");
      return;
    }
    const started = Date.now();
    try {
      await heartbeat(kind === "collect" ? "collecting" : "analyzing");
      if (kind === "collect") {
        const result = await collect(context(), { limit: 10 });
        if (result.sources) log(`collected ${result.stored} new items from ${result.sources} sources`);
      } else {
        const result = await processPending(context(), { limit: settings.ai.concurrency * 4, state: passState });
        if (result.processed) log(`processed ${result.processed} items`, result.statuses);
      }
      status.lastPassAt = new Date().toISOString();
      status.lastPassMs = Date.now() - started;
      status.consecutiveFailures = 0;
      status.lastError = null;
    } catch (error) {
      if (controller.signal.aborted) return;
      status.consecutiveFailures += 1;
      status.lastError = errorMessage(error);
      log(`${kind} pass failed`, status.lastError);
      await emitEvent(db, { code: "worker.pass_failed", level: status.consecutiveFailures >= 5 ? "error" : "warn", message: status.lastError, data: { kind } });
    } finally {
      await heartbeat("idle");
    }
  }

  if (once) {
    settings = await readBotSettings(db);
    log(`single pass (bot ${settings.enabled ? "enabled" : "disabled; forcing"})`);
    await runPass("collect", true);
    await runPass("process", true);
    await sql.end({ timeout: 5 });
    return;
  }

  // One worker per database: hold a session-level advisory lock on a reserved connection.
  const lockConnection = await sql.reserve();
  for (;;) {
    const [row] = await lockConnection`select pg_try_advisory_lock(${WORKER_LOCK_KEY}) as locked`;
    if (row?.locked) break;
    await heartbeat("waiting_lock");
    log("another worker holds the lock; waiting");
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }
  log(`started (${status.instanceId}, version ${VERSION})`);
  await emitEvent(db, { code: "worker.started", data: { host: status.host, version: VERSION } });

  const timers: NodeJS.Timeout[] = [];
  const running = { collect: false, process: false, maintain: false };
  let collectRequested = false;

  async function guarded(kind: keyof typeof running, task: () => Promise<void>) {
    if (running[kind] || controller.signal.aborted) return;
    running[kind] = true;
    try {
      await task();
    } finally {
      running[kind] = false;
    }
  }

  const scheduleCollect = () =>
    guarded("collect", async () => {
      do {
        collectRequested = false;
        await runPass("collect", false);
      } while (collectRequested && !controller.signal.aborted);
    });

  /** After a settings change or a manual scan: forget an AI pause and make the items it put aside due again. */
  async function resume() {
    const hadPause = Boolean(passState.aiPause || passState.missingKeyAnnounced || passState.budgetAnnounced);
    passState.aiPause = null;
    passState.missingKeyAnnounced = false;
    passState.budgetAnnounced = undefined;
    if (!hadPause) return;
    const resumed = await resumeWaitingItems(db).catch(() => 0);
    if (resumed) log(`resumed ${resumed} waiting items`);
  }

  await sql.listen(CONTROL_CHANNEL, (payload) => {
    if (payload === "scan") {
      log("scan requested");
      void resume().then(() => {
        collectRequested = true;
        void scheduleCollect();
        void guarded("process", () => runPass("process"));
      });
    }
    if (payload === "settings") {
      void readBotSettings(db)
        .then(async (next) => {
          settings = next;
          await resume();
          await heartbeat();
        })
        .catch((error) => log("settings reload failed", errorMessage(error)));
    }
  });

  timers.push(setInterval(() => void heartbeat(), HEARTBEAT_EVERY_MS));
  timers.push(setInterval(() => void scheduleCollect(), COLLECT_EVERY_MS));
  timers.push(setInterval(() => void guarded("process", () => runPass("process")), PROCESS_EVERY_MS));
  timers.push(
    setInterval(
      () =>
        void guarded("maintain", async () => {
          const removed = await maintain(context()).catch((error) => {
            log("maintenance failed", errorMessage(error));
            return null;
          });
          if (removed && (removed.items || removed.events)) log("maintenance", removed);
        }),
      MAINTAIN_EVERY_MS,
    ),
  );
  await heartbeat("idle");
  void scheduleCollect();

  let stopping = false;
  async function shutdown(signal: string) {
    if (stopping) return;
    stopping = true;
    log(`${signal} received, stopping`);
    controller.abort(new Error("shutdown"));
    for (const timer of timers) clearInterval(timer);
    const deadline = Date.now() + 20_000;
    while ((running.collect || running.process || running.maintain) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await heartbeat("stopping");
    await emitEvent(db, { code: "worker.stopped", data: { signal } });
    await lockConnection`select pg_advisory_unlock(${WORKER_LOCK_KEY})`.catch(() => {});
    lockConnection.release();
    await sql.end({ timeout: 5 });
    process.exit(0);
  }
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("[worker] fatal:", errorMessage(error));
  process.exit(1);
});
