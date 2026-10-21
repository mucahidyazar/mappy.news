import { Crown, MapPinCheck, Megaphone, MessageCircle, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Page, PageIntro, Panel } from "@/components/layout/container";
import { UserAvatar } from "@/components/layout/user-menu";
import { RankBadge } from "@/components/profile/rank-badge";
import { DAILY_COMMENT_POINT_LIMIT, POINTS } from "@/lib/domain/constants";
import { RANKS } from "@/lib/domain/ranks";
import { cn } from "@/lib/utils";
import { getLeaderboard } from "@/server/profile";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "leaderboard" });
  return { title: t("title"), description: t("description") };
}

export default async function LeaderboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("leaderboard");
  const tr = await getTranslations("ranks");
  const leaders = await getLeaderboard(50).catch(() => []);

  const ways = [
    { icon: Megaphone, title: t("ways.report"), points: POINTS.reportPublished },
    { icon: MapPinCheck, title: t("ways.verify"), points: POINTS.verificationApproved },
    { icon: MessageCircle, title: t("ways.comment", { limit: DAILY_COMMENT_POINT_LIMIT }), points: POINTS.commentPosted },
  ];

  return (
    <Page>
      <PageIntro
        title={
          <span className="inline-flex items-center gap-2.5">
            <Trophy className="size-8 text-warning" /> {t("title")}
          </span>
        }
        description={t("description")}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label={t("title")}>
          {leaders.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
              {leaders.map((leader, index) => (
                <li key={leader.id} className={cn("flex items-center gap-3 px-4 py-3", index < 3 && "bg-accent/40")}>
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums",
                      index === 0 ? "bg-warning text-black" : index < 3 ? "bg-primary/15 text-primary" : "text-muted-foreground",
                    )}
                  >
                    {index === 0 ? <Crown className="size-4" /> : index + 1}
                  </span>
                  <UserAvatar name={leader.name} image={leader.image} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{leader.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <RankBadge points={leader.points} />
                      <span>{t("reports", { count: leader.publishedReportCount })}</span>
                      <span>{t("verifications", { count: leader.verificationCount })}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block text-lg font-semibold tabular-nums">{leader.points}</span>
                    <span className="text-[11px] text-muted-foreground">{t("points")}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="space-y-5">
          <Panel>
            <h2 className="text-sm font-semibold">{t("howToEarn")}</h2>
            <ul className="mt-3 space-y-3">
              {ways.map(({ icon: Icon, title, points }) => (
                <li key={title} className="flex items-start gap-3 text-sm">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">{title}</span>
                  <span className="font-semibold text-success tabular-nums">+{points}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <h2 className="text-sm font-semibold">{t("ranks")}</h2>
            <ul className="mt-3 space-y-2">
              {RANKS.map((rank) => (
                <li key={rank.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{rank.icon}</span>
                    <span style={{ color: rank.color }} className="font-medium">
                      {tr(rank.key)}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{t("from", { points: rank.minPoints })}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </Page>
  );
}
