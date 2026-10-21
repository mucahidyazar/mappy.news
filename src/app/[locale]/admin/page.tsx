import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  FileClock,
  type LucideIcon,
  MapPinCheck,
  MessageSquare,
  Newspaper,
  Rss,
  Shapes,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getNow, getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { DeskClock } from "@/components/admin/dashboard/desk-clock";
import { DeskMapLoader } from "@/components/admin/dashboard/desk-map-loader";
import { Panel } from "@/components/layout/container";
import { RelativeTime } from "@/components/news/relative-time";
import { Button } from "@/components/ui/button";
import { translateDynamic } from "@/i18n/dynamic";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { getBotOverview } from "@/server/admin/bot";
import { getDashboard } from "@/server/admin/dashboard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("dashboard") };
}

const ACTIVITY_ICON: Record<string, LucideIcon> = {
  news: Newspaper,
  verification: MapPinCheck,
  comment: MessageSquare,
  user: UserRound,
  category: Shapes,
  source: Rss,
  bot: Bot,
};

const BOT_DOT = { running: "bg-success", paused: "bg-warning", offline: "bg-destructive" } as const;

function Ticker({ href, label, value, hint, attention }: { href?: string; label: string; value: string; hint: ReactNode; attention?: boolean }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 font-mono text-[10.5px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
        {href ? <ArrowUpRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" aria-hidden /> : null}
      </span>
      <span className={cn("mt-3 block font-display text-[2.25rem] leading-none font-bold tracking-[-0.03em] tabular-nums", attention && "text-desk-pending")}>{value}</span>
      <span className="mt-2.5 block text-xs text-muted-foreground">{hint}</span>
    </>
  );
  return href ? (
    <Link href={href} className="group bg-card p-5 transition-colors outline-none hover:bg-accent/40 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset sm:p-6">
      {body}
    </Link>
  ) : (
    <div className="bg-card p-5 sm:p-6">{body}</div>
  );
}

export default async function AdminDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const viewer = await requirePermission("admin.access");
  const [t, tAudit, tNav, tSteps, tProviders, format, now] = await Promise.all([
    getTranslations("admin.dashboard"),
    getTranslations("admin.audit"),
    getTranslations("admin.nav"),
    getTranslations("admin.bot.steps"),
    getTranslations("admin.botSettings.providers"),
    getFormatter(),
    getNow(),
  ]);
  const [dashboard, bot] = await Promise.all([getDashboard(), can(viewer.role, "bot.view") ? getBotOverview() : Promise.resolve(null)]);
  const { counts, people, days, mapPoints, oldestPendingAt, recent } = dashboard;
  const pending = counts.pendingUser + counts.pendingBot;
  const mapPending = mapPoints.filter((point) => point.status === "pending").length;
  const max = Math.max(1, ...days.map((day) => day.user + day.bot + day.admin));
  const total14 = days.reduce((sum, day) => sum + day.user + day.bot + day.admin, 0);
  const botState = bot ? (!bot.worker?.online ? "offline" : bot.settings.enabled ? "running" : "paused") : null;
  const spendRatio = bot && bot.settings.ai.dailyBudgetUsd > 0 ? Math.min(1, bot.today.cost / bot.settings.ai.dailyBudgetUsd) : 0;

  return (
    <div className="space-y-5">
      {/* The desk: Türkiye with what went out this week and what is waiting. */}
      <section aria-labelledby="desk-title" className="relative isolate overflow-hidden rounded-[1.75rem] border bg-desk-sea shadow-surface">
        <div className="relative h-64 sm:h-80 lg:absolute lg:inset-0 lg:h-auto">
          <DeskMapLoader points={mapPoints} />
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[64%] bg-linear-to-r from-desk-sea from-35% via-desk-sea/80 to-transparent lg:block" />
        <div className="pointer-events-none relative z-10 flex flex-col gap-8 p-6 sm:p-8 lg:min-h-[26rem] lg:max-w-[46%] lg:justify-between lg:p-10">
          <DeskClock className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase" />
          <div>
            <h1 id="desk-title" className="font-display text-[2.6rem] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance sm:text-[3.25rem]">
              {t("title", { name: viewer.name.split(" ")[0] || viewer.name })}
            </h1>
            <p className="mt-4 max-w-md text-lg leading-snug text-pretty text-muted-foreground">
              {pending ? (
                <>
                  <span className="font-semibold text-foreground">{t("heroPending", { count: pending })}</span>
                  {oldestPendingAt ? ` ${t("heroOldest", { time: format.relativeTime(new Date(oldestPendingAt), now) })}` : null}
                </>
              ) : (
                t("heroQuiet", { count: counts.published24h })
              )}
            </p>
            <div className="pointer-events-auto mt-7 flex flex-wrap gap-2">
              <Button asChild size="lg" className="h-11 rounded-full px-5 text-[15px] shadow-lg shadow-primary/20">
                <Link href={pending ? "/admin/review" : "/admin/news"}>
                  {pending ? t("startReview") : t("openStories")}
                  <ArrowRight />
                </Link>
              </Button>
              {counts.pendingVerifications ? (
                <Button asChild size="lg" variant="outline" className="h-11 rounded-full bg-background/40 px-5 backdrop-blur">
                  <Link href="/admin/verifications">
                    <MapPinCheck />
                    {t("checkLocations", { count: counts.pendingVerifications })}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
            <div className="flex items-center gap-2">
              {/* Published stories wear their category's color. */}
              <span aria-hidden className="size-2.5 rounded-full bg-[conic-gradient(#f59e0b,#ea580c,#dc2626,#7c3aed,#0ea5e9,#10b981,#f59e0b)]" />
              <dt>{t("mapPublished")}</dt>
              <dd className="text-foreground tabular-nums">{format.number(mapPoints.length - mapPending)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 rounded-full border-[1.5px] border-desk-pending" />
              <dt>{t("mapPending")}</dt>
              <dd className="text-foreground tabular-nums">{format.number(mapPending)}</dd>
            </div>
            <div>{t("mapRange")}</div>
          </dl>
        </div>
      </section>

      <section aria-label={t("summary")} className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border/70 shadow-surface lg:grid-cols-4">
        <Ticker
          href="/admin/review"
          label={t("pending")}
          value={format.number(pending)}
          hint={t("pendingHint", { users: counts.pendingUser, bot: counts.pendingBot })}
          attention={pending > 0}
        />
        <Ticker
          href="/admin/news"
          label={t("published")}
          value={format.number(counts.published24h)}
          hint={t("publishedHint", { week: counts.published7d, total: counts.publishedTotal })}
        />
        <Ticker
          href={can(viewer.role, "verifications.review") ? "/admin/verifications" : undefined}
          label={t("verifications")}
          value={format.number(counts.pendingVerifications)}
          hint={t("comments", { count: counts.comments24h })}
        />
        <Ticker
          href={can(viewer.role, "users.manage") ? "/admin/users" : undefined}
          label={t("users")}
          value={format.number(people.total)}
          hint={t("newUsers", { count: people.new7d })}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel className="flex flex-col p-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-[17px] font-bold tracking-tight">{t("chartTitle")}</h2>
              <p className="mt-1 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">{t("chartTotal", { count: total14 })}</p>
            </div>
            <ul className="flex gap-3 text-xs text-muted-foreground">
              {(["bot", "user", "admin"] as const).map((origin) => (
                <li key={origin} className="flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-[3px]", origin === "bot" ? "bg-chart-1" : origin === "user" ? "bg-chart-2" : "bg-chart-3")} />
                  {t(`legend.${origin}`)}
                </li>
              ))}
            </ul>
          </header>
          <div className="relative mt-7 min-h-52 flex-1">
            <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2, 3].map((line) => (
                <span key={line} className="border-t border-dashed border-border/80" />
              ))}
            </div>
            <span aria-hidden className="absolute -top-2 left-0 bg-card pr-2 font-mono text-[10px] text-muted-foreground tabular-nums">
              {max}
            </span>
            <ol className="relative flex h-full items-end gap-1.5 sm:gap-2.5" aria-label={t("chartTitle")}>
              {days.map((day, index) => {
                const total = day.user + day.bot + day.admin;
                const today = index === days.length - 1;
                return (
                  <li
                    key={day.day}
                    className="group flex h-full flex-1 flex-col justify-end"
                    title={`${format.dateTime(new Date(day.day), { day: "numeric", month: "long" })}: ${total}`}
                  >
                    {total ? (
                      <div
                        className={cn(
                          "flex w-full flex-col overflow-hidden rounded-t-md rounded-b-[3px] transition-[filter] duration-200 group-hover:brightness-115",
                          today && "ring-2 ring-primary/35 ring-offset-2 ring-offset-card",
                        )}
                        style={{ height: `${Math.max(4, (total / max) * 100)}%` }}
                      >
                        <span className="bg-chart-3" style={{ flexGrow: day.admin }} />
                        <span className="bg-chart-2" style={{ flexGrow: day.user }} />
                        <span className="bg-chart-1" style={{ flexGrow: day.bot }} />
                      </div>
                    ) : (
                      <span className="h-[3px] w-full rounded-full bg-foreground/10" />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
          <ol aria-hidden className="mt-2.5 flex gap-1.5 font-mono text-[10px] text-muted-foreground tabular-nums sm:gap-2.5">
            {days.map((day, index) => {
              const today = index === days.length - 1;
              return (
                <li key={day.day} className={cn("flex-1 text-center", today && "font-semibold text-foreground")}>
                  <span className={cn(today && "sm:hidden")}>{format.dateTime(new Date(day.day), { day: "numeric" })}</span>
                  {today ? <span className="hidden sm:inline">{t("today")}</span> : null}
                </li>
              );
            })}
          </ol>
        </Panel>

        <div className="flex flex-col gap-5">
          {bot && botState ? (
            <Panel className="p-5">
              <header className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-display text-[17px] font-bold tracking-tight">
                  <Bot className="size-4 text-muted-foreground" /> {t("botTitle")}
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/50 px-2.5 py-1 text-xs">
                  <span className="relative flex size-2">
                    {botState === "running" ? <span className="absolute inset-0 animate-ping rounded-full bg-success/60 motion-reduce:hidden" /> : null}
                    <span className={cn("relative size-2 rounded-full", BOT_DOT[botState])} />
                  </span>
                  {tNav(`botState.${botState}`)}
                </span>
              </header>
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                {tProviders(bot.settings.ai.provider)} · {bot.settings.ai.model}
              </p>
              <ol className="mt-5 grid grid-cols-4 overflow-hidden rounded-xl border bg-background/40">
                {(
                  [
                    ["collect", bot.today.collected],
                    ["analyze", bot.today.aiCalls],
                    ["queued", bot.today.queued],
                    ["published", bot.today.published],
                  ] as const
                ).map(([step, value], index) => (
                  <li key={step} className={cn("px-2 py-3 text-center", index > 0 && "border-l")}>
                    <span className="block font-display text-xl leading-none font-bold tabular-nums">{format.number(value)}</span>
                    <span className="mt-1.5 block truncate text-[10.5px] text-muted-foreground">{tSteps(step)}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-5">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">{t("spend")}</span>
                  <span className="font-mono tabular-nums">
                    ${bot.today.cost.toFixed(2)} <span className="text-muted-foreground">/ ${bot.settings.ai.dailyBudgetUsd.toFixed(2)}</span>
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", spendRatio >= 1 ? "bg-destructive" : "bg-linear-to-r from-chart-1 to-chart-2")}
                    style={{ width: `${Math.max(spendRatio * 100, bot.today.cost > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
              <Link href="/admin/bot" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                {t("openBot")} <ArrowRight className="size-3.5" />
              </Link>
            </Panel>
          ) : null}

          <Panel className="flex-1 p-5">
            <h2 className="flex items-center gap-2 font-display text-[17px] font-bold tracking-tight">
              <Activity className="size-4 text-muted-foreground" /> {t("activity")}
            </h2>
            {recent.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("noActivity")}</p>
            ) : (
              <ol className="mt-4 space-y-3.5">
                {recent.map((entry) => {
                  const Icon = ACTIVITY_ICON[entry.targetType] ?? FileClock;
                  const text = (
                    <>
                      <span className="font-medium">{entry.actorName ?? tAudit("system")}</span>{" "}
                      <span className="text-muted-foreground">{translateDynamic(tAudit, `actions.${entry.action}`) ?? entry.action}</span>
                    </>
                  );
                  return (
                    <li key={entry.id} className="flex items-start gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Icon className="size-3.5" />
                      </span>
                      <p className="min-w-0 flex-1 text-sm leading-snug">
                        {entry.targetType === "news" && entry.targetId ? (
                          <Link href={`/admin/news/${entry.targetId}`} className="hover:underline">
                            {text}
                          </Link>
                        ) : (
                          text
                        )}
                      </p>
                      <RelativeTime value={entry.createdAt} className="shrink-0 pt-0.5 font-mono text-[10.5px] text-muted-foreground" />
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
