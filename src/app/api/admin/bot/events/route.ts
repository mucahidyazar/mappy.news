import { getAuth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { listRecentEvents } from "@/server/admin/bot";
import { subscribeBotEvents } from "@/server/bot-live";

export const dynamic = "force-dynamic";

/** Server-sent stream of news bot events for the admin panel. Resumes after Last-Event-ID. */
export async function GET(request: Request) {
  const session = await getAuth()
    .api.getSession({ headers: request.headers })
    .catch(() => null);
  if (!session?.user || session.user.banned || !can((session.user as { role?: string }).role, "bot.view")) {
    return new Response("Forbidden", { status: 403 });
  }

  const lastEventId = Number(request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("after") ?? 0);
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      send("retry: 5000\n\n");
      if (lastEventId > 0) {
        const missed = await listRecentEvents(100, lastEventId).catch(() => []);
        for (const event of missed.reverse()) send(`id: ${event.id}\nevent: bot\ndata: ${JSON.stringify(event)}\n\n`);
      }
      const unsubscribe = await subscribeBotEvents((event) => send(`id: ${event.id}\nevent: bot\ndata: ${JSON.stringify(event)}\n\n`)).catch(() => {
        send("event: unavailable\ndata: {}\n\n");
        return () => {};
      });
      const keepAlive = setInterval(() => send(": ping\n\n"), 15_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
