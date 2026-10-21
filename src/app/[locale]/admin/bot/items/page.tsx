import { AtSign, ExternalLink, RotateCcw, Rss } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";

import { ActionButton } from "@/components/admin/action-button";
import { EmptyPanel, PageHeader } from "@/components/admin/page-header";
import { Pagination, parsePage } from "@/components/admin/pagination";
import { UrlFilters } from "@/components/admin/url-filters";
import { RelativeTime } from "@/components/news/relative-time";
import { Badge } from "@/components/ui/badge";
import { translateDynamic } from "@/i18n/dynamic";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { BOT_ITEM_STATUSES, type BotItemStatus } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";
import { ITEMS_PAGE_SIZE, listBotItems, listSourcesWithStats } from "@/server/admin/bot";
import { retryItems } from "@/server/actions/admin-bot";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.items" });
  return { title: t("title") };
}

const STATUS_TONE: Record<BotItemStatus, string> = {
  new: "border-border",
  processing: "border-primary/40 bg-primary/10",
  screened_out: "border-border bg-muted text-muted-foreground",
  rejected: "border-border bg-muted text-muted-foreground",
  duplicate: "border-border bg-accent",
  queued: "border-warning/50 bg-warning/15",
  published: "border-success/50 bg-success/15",
  failed: "border-destructive/50 bg-destructive/10",
};

export default async function BotItemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; source?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const viewer = await requirePermission("bot.view");
  const canManage = can(viewer.role, "bot.manage");
  const search = await searchParams;
  const t = await getTranslations("admin.items");
  const status = (BOT_ITEM_STATUSES as readonly string[]).includes(search.status ?? "") ? (search.status as BotItemStatus) : undefined;
  const sourceId = z.uuid().safeParse(search.source).success ? search.source : undefined;
  const page = parsePage(search.page);
  const [{ items, total }, sourceRows] = await Promise.all([listBotItems({ status, sourceId, page }), listSourcesWithStats()]);

  return (
    <div>
      <PageHeader
        title={t("title")}
        description={t("description", { count: total })}
        actions={
          canManage && status === "failed" && total > 0 ? (
            <ActionButton size="sm" variant="outline" action={retryItems.bind(null, { allFailed: true })} success={t("retried")}>
              <RotateCcw className="size-4" /> {t("retryAll")}
            </ActionButton>
          ) : null
        }
      />
      <UrlFilters
        selects={[
          { name: "status", label: t("allStatuses"), options: BOT_ITEM_STATUSES.map((value) => ({ value, label: t(`status.${value}`) })) },
          { name: "source", label: t("allSources"), options: sourceRows.filter((row) => row.kind !== "web").map((row) => ({ value: row.id, label: row.name })) },
        ]}
      />
      {items.length === 0 ? (
        <EmptyPanel title={t("empty")} />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {items.map((item) => (
            <li key={item.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
                  <span className="mt-0.5 text-muted-foreground">{item.sourceKind === "x" ? <AtSign className="size-4" /> : <Rss className="size-4" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium">{item.analysis?.title || item.title || item.body.slice(0, 140)}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {item.sourceName} · <RelativeTime value={item.createdAt} />
                      {item.rejectionReason ? <span>· {translateDynamic(t, `reasons.${item.rejectionReason}`) ?? item.rejectionReason}</span> : null}
                      {item.lastError ? <span className="text-destructive">· {item.lastError}</span> : null}
                    </span>
                  </span>
                  <Badge variant="outline" className={cn("shrink-0", STATUS_TONE[item.status])}>
                    {t(`status.${item.status}`)}
                  </Badge>
                </summary>
                <div className="space-y-3 border-t bg-muted/30 px-4 py-3 text-sm">
                  {item.title ? <p className="font-medium">{item.title}</p> : null}
                  <p className="text-xs leading-relaxed whitespace-pre-line text-muted-foreground">{item.body}</p>
                  {item.analysis ? (
                    <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t("category")}</dt>
                        <dd>{item.analysis.categoryKey}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t("score")}</dt>
                        <dd>{Math.round(item.analysis.editorialScore * 100)}%</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t("location")}</dt>
                        <dd>
                          {item.geocode?.displayName ?? item.analysis.location.mention ?? "—"} ({item.analysis.location.precision})
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t("model")}</dt>
                        <dd>{item.analysis.model}</dd>
                      </div>
                    </dl>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-4">
                        {t("original")} <ExternalLink className="size-3" />
                      </a>
                    ) : null}
                    {item.newsId ? (
                      <Link href={`/admin/news/${item.newsId}`} className="text-xs underline underline-offset-4">
                        {t("openStory")}
                      </Link>
                    ) : null}
                    {canManage && ["failed", "rejected", "screened_out"].includes(item.status) ? (
                      <ActionButton size="xs" variant="outline" className="ml-auto" action={retryItems.bind(null, { id: item.id })} success={t("retried")}>
                        <RotateCcw className="size-3" /> {t("retry")}
                      </ActionButton>
                    ) : null}
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <Pagination pathname="/admin/bot/items" query={{ status, source: sourceId }} page={page} pageSize={ITEMS_PAGE_SIZE} total={total} />
    </div>
  );
}
