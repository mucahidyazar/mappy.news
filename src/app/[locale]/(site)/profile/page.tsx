import { CheckCircle2, Clock3, FileText, MapPinCheck, MessageCircle, Star, Trophy, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { CategoryIcon } from "@/components/icons/category-icon";
import { Page } from "@/components/layout/container";
import { UserAvatar } from "@/components/layout/user-menu";
import { RelativeTime } from "@/components/news/relative-time";
import { ProfileSettings } from "@/components/profile/profile-settings";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { rankFor, rankProgress } from "@/lib/domain/ranks";
import { newsPath } from "@/lib/news/format";
import { localizedPath } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getProfileSummary, listMyReports, listMyVerifications, listPointHistory } from "@/server/profile";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("title"), robots: { index: false } };
}

const STATUS_STYLE = {
  pending: { icon: Clock3, className: "border-warning/40 bg-warning/10 text-foreground" },
  published: { icon: CheckCircle2, className: "border-success/40 bg-success/10 text-foreground" },
  approved: { icon: CheckCircle2, className: "border-success/40 bg-success/10 text-foreground" },
  rejected: { icon: XCircle, className: "border-destructive/40 bg-destructive/10 text-foreground" },
  archived: { icon: XCircle, className: "border-border bg-muted text-muted-foreground" },
} as const;

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`${localizedPath("/sign-in", locale as Locale)}?next=${encodeURIComponent(localizedPath("/profile", locale as Locale))}`);

  const [summary, reports, verificationList, history] = await Promise.all([
    getProfileSummary(viewer.id),
    listMyReports(viewer.id),
    listMyVerifications(viewer.id),
    listPointHistory(viewer.id),
  ]);
  const t = await getTranslations("profile");
  const tr = await getTranslations("ranks");
  const format = await getFormatter();
  const rank = rankFor(summary.points);
  const progress = rankProgress(summary.points);

  const stats = [
    { icon: Star, label: t("stats.points"), value: summary.points },
    { icon: FileText, label: t("stats.published"), value: `${summary.publishedReportCount}/${summary.reportCount}` },
    { icon: MapPinCheck, label: t("stats.verifications"), value: summary.verificationCount },
    { icon: MessageCircle, label: t("stats.comments"), value: summary.commentCount },
  ];

  return (
    <Page>
      <section className="flex flex-col gap-6 rounded-2xl border bg-card p-5 md:flex-row md:items-center md:p-8">
        <UserAvatar name={viewer.name} image={viewer.image} className="size-20 border-4 border-background text-xl shadow" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="truncate text-2xl font-bold tracking-tight">{viewer.name}</h1>
            <p className="text-sm text-muted-foreground">
              {t("memberSince", { date: format.dateTime(new Date(summary.memberSince), { dateStyle: "long" }) })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold"
              style={{ borderColor: `${rank.color}66`, color: rank.color, backgroundColor: `${rank.color}14` }}
            >
              {rank.icon} {tr(rank.key)}
            </span>
            <Link href="/leaderboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <Trophy className="size-4" /> {t("position", { position: summary.position })}
            </Link>
          </div>
          {progress ? (
            <div className="max-w-md space-y-1.5">
              <Progress value={progress.progress * 100} aria-label={t("progressLabel")} />
              <p className="text-xs text-muted-foreground">
                {t("nextRank", { points: progress.remaining, rank: tr(progress.next.key) })}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("topRank")}</p>
          )}
        </div>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-2xl border bg-card p-5">
            <Icon className="size-4 text-muted-foreground" />
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="reports" className="mt-8">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="reports">{t("tabs.reports")}</TabsTrigger>
          <TabsTrigger value="verifications">{t("tabs.verifications")}</TabsTrigger>
          <TabsTrigger value="points">{t("tabs.points")}</TabsTrigger>
          <TabsTrigger value="settings">{t("tabs.settings")}</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-4">
          {reports.length === 0 ? (
            <EmptyRow text={t("emptyReports")} />
          ) : (
            <ul className="divide-y rounded-2xl border bg-card">
              {reports.map((report) => {
                const style = STATUS_STYLE[report.status];
                const Icon = style.icon;
                return (
                  <li key={report.id} className="flex items-start gap-3 p-4">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: report.categoryColor }}>
                      <CategoryIcon icon={report.categoryIcon} className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      {report.status === "published" ? (
                        <Link href={newsPath(report.slug)} className="font-medium hover:underline">
                          {report.title}
                        </Link>
                      ) : (
                        <p className="font-medium">{report.title}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {report.locationLabel} · <RelativeTime value={report.createdAt} />
                      </p>
                      {report.status === "rejected" && report.rejectionReason ? (
                        <p className="mt-1 text-xs text-destructive">{t("rejectedBecause", { reason: report.rejectionReason })}</p>
                      ) : null}
                    </div>
                    <Badge variant="outline" className={cn("shrink-0 gap-1", style.className)}>
                      <Icon className="size-3" /> {t(`status.${report.status}`)}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="verifications" className="mt-4">
          {verificationList.length === 0 ? (
            <EmptyRow text={t("emptyVerifications")} />
          ) : (
            <ul className="divide-y rounded-2xl border bg-card">
              {verificationList.map((item) => {
                const style = STATUS_STYLE[item.status];
                const Icon = style.icon;
                return (
                  <li key={item.id} className="flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <Link href={newsPath(item.newsSlug)} className="font-medium hover:underline">
                        {item.newsTitle}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {item.address} · <RelativeTime value={item.createdAt} />
                      </p>
                      {item.reviewNote ? <p className="mt-1 text-xs text-muted-foreground">{item.reviewNote}</p> : null}
                    </div>
                    <Badge variant="outline" className={cn("shrink-0 gap-1", style.className)}>
                      <Icon className="size-3" /> {t(`status.${item.status}`)}
                      {item.pointsAwarded ? ` · +${item.pointsAwarded}` : ""}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="points" className="mt-4">
          {history.length === 0 ? (
            <EmptyRow text={t("emptyPoints")} />
          ) : (
            <ul className="divide-y rounded-2xl border bg-card">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{t(`actions.${entry.action}`)}</p>
                    <p className="text-xs text-muted-foreground">
                      <RelativeTime value={entry.createdAt} />
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-semibold tabular-nums", entry.amount > 0 ? "text-success" : "text-destructive")}>
                      {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">{t("balance", { points: entry.balanceAfter })}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <ProfileSettings name={viewer.name} hasPassword={summary.hasPassword} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</p>;
}
