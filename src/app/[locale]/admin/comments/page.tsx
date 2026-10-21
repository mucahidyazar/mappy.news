import { Eye, EyeOff, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ActionButton } from "@/components/admin/action-button";
import { EmptyPanel, PageHeader } from "@/components/admin/page-header";
import { Pagination, parsePage } from "@/components/admin/pagination";
import { STATUS_BADGE } from "@/components/admin/status-styles";
import { UrlFilters } from "@/components/admin/url-filters";
import { RelativeTime } from "@/components/news/relative-time";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/session";
import { COMMENT_STATUSES, type CommentStatus } from "@/lib/domain/constants";
import { listCommentsForModeration, PAGE_SIZE } from "@/server/admin/moderation";
import { moderateComment } from "@/server/actions/admin-moderation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.comments" });
  return { title: t("title") };
}

export default async function CommentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("comments.moderate");
  const search = await searchParams;
  const status = (COMMENT_STATUSES as readonly string[]).includes(search.status ?? "") ? (search.status as CommentStatus) : undefined;
  const page = parsePage(search.page);
  const t = await getTranslations("admin.comments");
  const { items, total } = await listCommentsForModeration({ status, q: search.q?.slice(0, 80), page });

  return (
    <div>
      <PageHeader title={t("title")} description={t("description", { count: total })} />
      <UrlFilters
        searchPlaceholder={t("search")}
        selects={[{ name: "status", label: t("allStatuses"), options: COMMENT_STATUSES.map((value) => ({ value, label: t(`status.${value}`) })) }]}
      />
      {items.length === 0 ? (
        <EmptyPanel title={t("empty")} />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{item.userName}</span>
                  <span>{item.userEmail}</span>
                  <span>·</span>
                  <RelativeTime value={item.createdAt} />
                  <Badge variant="outline" className={STATUS_BADGE[item.status]}>
                    {t(`status.${item.status}`)}
                  </Badge>
                </div>
                <p className="text-sm whitespace-pre-line">{item.body}</p>
                <Link href={`/admin/news/${item.newsId}`} className="text-xs text-muted-foreground hover:underline">
                  ↳ {item.newsTitle}
                </Link>
                {item.hiddenReason ? <p className="text-xs text-destructive">{item.hiddenReason}</p> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                {item.status === "visible" ? (
                  <ActionButton variant="outline" size="sm" action={moderateComment.bind(null, { id: item.id, action: "hide", reason: t("defaultReason") })} success={t("hidden")}>
                    <EyeOff className="size-4" /> {t("hide")}
                  </ActionButton>
                ) : (
                  <ActionButton variant="outline" size="sm" action={moderateComment.bind(null, { id: item.id, action: "restore" })} success={t("restored")}>
                    <Eye className="size-4" /> {t("restore")}
                  </ActionButton>
                )}
                <ActionButton variant="ghost" size="sm" className="text-destructive" action={moderateComment.bind(null, { id: item.id, action: "delete" })} success={t("deleted")}>
                  <Trash2 className="size-4" />
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination pathname="/admin/comments" query={{ status, q: search.q }} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
