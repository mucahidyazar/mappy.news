import { Activity, ArrowRight, Bot, Inbox, MapPinCheck, MessageSquare, Newspaper, Users } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader, StatCard } from "@/components/admin/page-header";
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

export default async function AdminDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const viewer = await requirePermission("admin.access");
  const t = await getTranslations("admin.dashboard");
  const tAudit = await getTranslations("admin.audit");
  const format = await getFormatter();
  const [dashboard, bot] = await Promise.all([getDashboard(), can(viewer.role, "bot.view") ? getBotOverview() : Promise.resolve(null)]);
  const { counts, people, days } = dashboard;
  const max = Math.max(1, ...days.map((day) => day.user + day.bot + day.admin));
  const pending = counts.pendingUser + counts.pendingBot;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title", { name: viewer.name.split(" ")[0] ?? viewer.name })}
        description={t("description")}
        actions={
          pending ? (
            <Button asChild>
              <Link href="/admin/review">
                <Inbox className="size-4" /> {t("reviewNow", { count: pending })}
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("pending")} value={pending} hint={t("pendingHint", { users: counts.pendingUser, bot: counts.pendingBot })} icon={<Inbox />} />
        <StatCard label={t("published")} value={counts.published24h} hint={t("publishedHint", { week: counts.published7d, total: counts.publishedTotal })} icon={<Newspaper />} />
        <StatCard label={t("verifications")} value={counts.pendingVerifications} hint={t("comments", { count: counts.comments24h })} icon={<MapPinCheck />} />
        <StatCard label={t("users")} value={people.total} hint={t("newUsers", { count: people.new7d })} icon={<Users />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t("chartTitle")}</h2>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-1" /> {t("legend.bot")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-2" /> {t("legend.user")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-3" /> {t("legend.admin")}
              </span>
            </div>
          </div>
          <div className="flex h-44 items-end gap-1.5" role="img" aria-label={t("chartTitle")}>
            {days.map((day) => {
              const total = day.user + day.bot + day.admin;
              return (
                <div key={day.day} className="group flex h-full flex-1 flex-col justify-end" title={`${day.day}: ${total}`}>
                  <div className="flex w-full flex-col overflow-hidden rounded-md" style={{ height: `${(total / max) * 100}%`, minHeight: total ? 4 : 0 }}>
                    <span className="bg-chart-3" style={{ flexGrow: day.admin }} />
                    <span className="bg-chart-2" style={{ flexGrow: day.user }} />
                    <span className="bg-chart-1" style={{ flexGrow: day.bot }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>{format.dateTime(new Date(days[0]!.day), { day: "numeric", month: "short" })}</span>
            <span>{format.dateTime(new Date(days[days.length - 1]!.day), { day: "numeric", month: "short" })}</span>
          </div>
        </section>

        <div className="space-y-5">
          {bot ? (
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="size-4" /> {t("botTitle")}
              </h2>
              <p className="mt-2 flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    !bot.worker?.online ? "bg-destructive" : bot.settings.enabled ? "bg-success" : "bg-warning",
                  )}
                />
                {!bot.worker?.online ? t("botOffline") : bot.settings.enabled ? t("botRunning") : t("botPaused")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("botToday", { stories: bot.today.queued + bot.today.published, cost: bot.today.cost.toFixed(2) })}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                <Link href="/admin/bot">
                  {t("openBot")} <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </section>
          ) : null}
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="size-4" /> {t("activity")}
            </h2>
            {dashboard.recent.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("noActivity")}</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {dashboard.recent.map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <span className="font-medium">{entry.actorName ?? tAudit("system")}</span>{" "}
                    <span className="text-muted-foreground">{translateDynamic(tAudit, `actions.${entry.action}`) ?? entry.action}</span>
                    <span className="block text-xs text-muted-foreground">
                      <RelativeTime value={entry.createdAt} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="size-4" /> {t("shortcuts")}
            </h2>
            <div className="mt-3 grid gap-2">
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link href="/admin/verifications">{t("shortcutVerifications")}</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link href="/admin/comments">{t("shortcutComments")}</Link>
              </Button>
              {can(viewer.role, "bot.manage") ? (
                <Button asChild variant="outline" size="sm" className="justify-start">
                  <Link href="/admin/bot/sources">{t("shortcutSources")}</Link>
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
