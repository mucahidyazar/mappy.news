import { Bot, Eye, Layers, MessageCircle, PenLine, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { STATUS_BADGE } from "@/components/admin/status-styles";
import { EmptyPanel, PageHeader } from "@/components/admin/page-header";
import { Pagination, parsePage } from "@/components/admin/pagination";
import { UrlFilters } from "@/components/admin/url-filters";
import { RelativeTime } from "@/components/news/relative-time";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/session";
import { NEWS_ORIGINS, NEWS_STATUSES, type NewsOrigin, type NewsStatus } from "@/lib/domain/constants";
import { categoryName } from "@/lib/news/format";
import { ADMIN_PAGE_SIZE, listAdminNews } from "@/server/admin/news";
import { getAllCategories } from "@/server/categories";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.news" });
  return { title: t("title") };
}

type Search = { status?: string; origin?: string; category?: string; q?: string; page?: string };

export default async function AdminNewsListPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("news.review");
  const search = await searchParams;
  const t = await getTranslations("admin.news");
  const tStatus = await getTranslations("story.status");
  const tOrigin = await getTranslations("admin.editor.origin");

  const status = (NEWS_STATUSES as readonly string[]).includes(search.status ?? "") ? (search.status as NewsStatus) : undefined;
  const origin = (NEWS_ORIGINS as readonly string[]).includes(search.origin ?? "") ? (search.origin as NewsOrigin) : undefined;
  const page = parsePage(search.page);
  const [categories, { items, total }] = await Promise.all([
    getAllCategories(),
    listAdminNews({ status, origin, category: search.category, q: search.q?.slice(0, 80), page }),
  ]);

  return (
    <div>
      <PageHeader title={t("title")} description={t("description", { count: total })} />
      <UrlFilters
        searchPlaceholder={t("search")}
        selects={[
          { name: "status", label: t("allStatuses"), options: NEWS_STATUSES.map((value) => ({ value, label: tStatus(value) })) },
          { name: "origin", label: t("allOrigins"), options: NEWS_ORIGINS.map((value) => ({ value, label: tOrigin(value) })) },
          { name: "category", label: t("allCategories"), options: categories.map((category) => ({ value: category.key, label: categoryName(category, locale) })) },
        ]}
      />
      {items.length === 0 ? (
        <EmptyPanel title={t("empty")} />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.story")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("columns.status")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("columns.source")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("columns.stats")}</TableHead>
                <TableHead className="text-right">{t("columns.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-md">
                    <Link href={`/admin/news/${item.id}`} className="group flex items-start gap-2.5">
                      <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.category.color }} />
                      <span className="min-w-0">
                        <span className="line-clamp-2 font-medium whitespace-normal group-hover:underline">{item.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {categoryName(item.category, locale)} · {item.locationLabel}
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" className={STATUS_BADGE[item.status]}>
                      {tStatus(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    <span className="inline-flex items-center gap-1">
                      {item.origin === "bot" ? <Bot className="size-3.5" /> : item.origin === "user" ? <UserRound className="size-3.5" /> : <PenLine className="size-3.5" />}
                      {item.sourceName ?? item.submitterName ?? tOrigin(item.origin)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                    <span className="inline-flex items-center gap-2.5">
                      <span className="inline-flex items-center gap-0.5">
                        <Eye className="size-3" /> {item.viewCount}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <MessageCircle className="size-3" /> {item.commentCount}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <Layers className="size-3" /> {item.citationCount}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    <RelativeTime value={item.createdAt} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination
        pathname="/admin/news"
        query={{ status, origin, category: search.category, q: search.q }}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
      />
    </div>
  );
}
