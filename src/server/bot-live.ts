import "server-only";

import { EVENTS_CHANNEL } from "@/lib/bot/status";
import { getSql } from "@/lib/db";

import { type BotEventRow, getEventById } from "./admin/bot";

type Subscriber = (event: BotEventRow) => void;

const globalForLive = globalThis as unknown as {
  __mappyBotSubscribers?: Set<Subscriber>;
  __mappyBotListener?: Promise<{ unlisten: () => Promise<void> }> | null;
};

const subscribers = (globalForLive.__mappyBotSubscribers ??= new Set());

/**
 * One LISTEN connection per server process fans bot events out to every open admin stream; each event row
 * is read once, not once per viewer.
 */
export async function subscribeBotEvents(subscriber: Subscriber): Promise<() => void> {
  subscribers.add(subscriber);
  if (!globalForLive.__mappyBotListener) {
    globalForLive.__mappyBotListener = getSql()
      .listen(EVENTS_CHANNEL, (payload) => {
        const id = Number(payload);
        if (!Number.isSafeInteger(id)) return;
        void getEventById(id)
          .then((event) => {
            if (!event) return;
            for (const notify of subscribers) notify(event);
          })
          .catch(() => {});
      })
      .catch((error) => {
        globalForLive.__mappyBotListener = null;
        throw error;
      });
  }
  await globalForLive.__mappyBotListener;
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && globalForLive.__mappyBotListener) {
      const listener = globalForLive.__mappyBotListener;
      globalForLive.__mappyBotListener = null;
      void listener.then((handle) => handle.unlisten()).catch(() => {});
    }
  };
}
