"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/** Deaths in the destructive color, injuries in the warning color: the same two marks everywhere. */
const MARK = { deaths: "bg-destructive", injured: "bg-warning" } as const;

/**
 * "● 2 ölü ● 5 yaralı" for lists, previews and the map panel. Counts a report didn't give, and zeros, are left
 * out; nothing is rendered when nothing is known.
 */
export function CasualtyChips({ deaths, injured, label, className }: { deaths: number | null; injured: number | null; label?: string; className?: string }) {
  const t = useTranslations("casualties");
  const shown = (["deaths", "injured"] as const).filter((kind) => ((kind === "deaths" ? deaths : injured) ?? 0) > 0);
  if (shown.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-0.5", className)} title={label}>
      {label ? <span className="sr-only">{label}:</span> : null}
      {shown.map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1 tabular-nums">
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", MARK[kind])} />
          {t(kind, { count: (kind === "deaths" ? deaths : injured)! })}
        </span>
      ))}
    </span>
  );
}

/** The toll on a story page: one cell per known count, or a line saying no one was hurt. */
export function CasualtyStats({
  deaths,
  injured,
  fromUpdates,
  className,
}: {
  deaths: number | null;
  injured: number | null;
  fromUpdates: boolean;
  className?: string;
}) {
  const t = useTranslations("casualties");
  if (deaths == null && injured == null) return null;
  if (!deaths && !injured) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{t("none")}</p>;
  }
  const cells = (["deaths", "injured"] as const).filter((kind) => (kind === "deaths" ? deaths : injured) != null);
  return (
    <section aria-label={t("title")} className={cn("space-y-1.5", className)}>
      <dl className="inline-grid grid-flow-col overflow-hidden rounded-xl border bg-card">
        {cells.map((kind, index) => {
          const count = (kind === "deaths" ? deaths : injured)!;
          return (
            <div key={kind} className={cn("relative min-w-36 px-4 pt-3.5 pb-3", index > 0 && "border-l")}>
              <span aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5", MARK[kind])} />
              <dt className="text-xs text-muted-foreground">{t(`${kind}Label`)}</dt>
              <dd className="mt-0.5 text-2xl leading-none font-bold tracking-tight tabular-nums">
                <span className="sr-only">{t(`${kind}Long`, { count })}</span>
                <span aria-hidden>{count}</span>
              </dd>
            </div>
          );
        })}
      </dl>
      {fromUpdates ? <p className="text-xs text-muted-foreground">{t("fromUpdates")}</p> : null}
    </section>
  );
}
