"use client";

import { AlertTriangle, CircleDot, Info, Radio, XOctagon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { RelativeTime } from "@/components/news/relative-time";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { translateDynamic } from "@/i18n/dynamic";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { BotEventRow } from "@/server/admin/bot";

const REFRESH_CODES = new Set(["item.queued", "item.published", "item.failed", "source.failed", "settings.changed", "worker.started", "worker.stopped"]);

function LevelIcon({ level }: { level: string }) {
  if (level === "error") return <XOctagon className="size-3.5 text-destructive" />;
  if (level === "warn") return <AlertTriangle className="size-3.5 text-warning" />;
  return <Info className="size-3.5 text-muted-foreground" />;
}

/** Live bot log over server-sent events; key changes also refresh the numbers above it (throttled). */
export function LiveFeed({ initial }: { initial: BotEventRow[] }) {
  const t = useTranslations("admin.bot");
  const router = useRouter();
  const [events, setEvents] = useState<BotEventRow[]>(initial);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<"all" | "problems" | "stories">("all");
  const lastRefresh = useRef(0);
  const pendingRefresh = useRef<number | null>(null);

  useEffect(() => {
    const after = initial[0]?.id ?? 0;
    const source = new EventSource(`/api/admin/bot/events?after=${after}`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener("bot", (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as BotEventRow;
      setEvents((current) => (current.some((item) => item.id === event.id) ? current : [event, ...current].slice(0, 200)));
      if (REFRESH_CODES.has(event.code)) {
        const wait = Math.max(0, 5_000 - (Date.now() - lastRefresh.current));
        if (pendingRefresh.current === null) {
          pendingRefresh.current = window.setTimeout(() => {
            pendingRefresh.current = null;
            lastRefresh.current = Date.now();
            router.refresh();
          }, wait);
        }
      }
    });
    return () => {
      source.close();
      if (pendingRefresh.current !== null) window.clearTimeout(pendingRefresh.current);
    };
    // The stream opens once per mount; later events arrive through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(
    () =>
      events.filter((event) =>
        filter === "problems"
          ? event.level !== "info"
          : filter === "stories"
            ? ["item.queued", "item.published", "item.duplicate"].includes(event.code)
            : true,
      ),
    [events, filter],
  );

  function describe(event: BotEventRow) {
    const key = `events.${event.code}`;
    const values = {
      source: event.sourceName ?? "—",
      stored: String(event.data.stored ?? 0),
      fetched: String(event.data.fetched ?? 0),
      reason: String(event.data.reason ?? event.message ?? ""),
      title: String(event.data.title ?? ""),
      location: String(event.data.location ?? ""),
      score: event.data.score != null ? `${Math.round(Number(event.data.score) * 100)}%` : "",
      message: event.message ?? "",
      model: event.model ?? "",
    };
    return translateDynamic(t, key, values) ?? `${event.code}${event.message ? `: ${event.message}` : ""}`;
  }

  return (
    <section className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Radio className={cn("size-4", connected ? "text-success" : "text-muted-foreground")} />
          {t("liveTitle")}
          <span className="text-xs font-normal text-muted-foreground">{connected ? t("connected") : t("reconnecting")}</span>
        </h2>
        <ToggleGroup type="single" size="sm" value={filter} onValueChange={(value) => value && setFilter(value as typeof filter)}>
          <ToggleGroupItem value="all" className="h-7 px-2.5 text-xs">
            {t("filterAll")}
          </ToggleGroupItem>
          <ToggleGroupItem value="stories" className="h-7 px-2.5 text-xs">
            {t("filterStories")}
          </ToggleGroupItem>
          <ToggleGroupItem value="problems" className="h-7 px-2.5 text-xs">
            {t("filterProblems")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {visible.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("noEvents")}</p>
      ) : (
        <ol className="scrollbar-thin max-h-[560px] divide-y overflow-y-auto">
          {visible.map((event) => (
            <li key={event.id} className="flex items-start gap-2.5 px-4 py-2.5 text-sm">
              <span className="mt-1">
                <LevelIcon level={event.level} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words">{describe(event)}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <RelativeTime value={event.createdAt} />
                  {event.sourceName ? <span>· {event.sourceName}</span> : null}
                  {event.costUsd ? <span>· ${event.costUsd.toFixed(4)}</span> : null}
                  {event.durationMs ? <span>· {(event.durationMs / 1000).toFixed(1)} sn</span> : null}
                  {event.newsId ? (
                    <Link href={`/admin/news/${event.newsId}`} className="inline-flex items-center gap-0.5 hover:underline">
                      <CircleDot className="size-3" /> {t("openStory")}
                    </Link>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
