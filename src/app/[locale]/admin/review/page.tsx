import { Bot, Inbox, ShieldAlert, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { NewsEditor } from "@/components/admin/news-editor";
import { EmptyPanel, PageHeader } from "@/components/admin/page-header";
import { Pagination, parsePage } from "@/components/admin/pagination";
import { RelativeTime } from "@/components/news/relative-time";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { ADMIN_PAGE_SIZE, getAdminNews, listAdminNews } from "@/server/admin/news";
import { getAllCategories } from "@/server/categories";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.review" });
  return { title: t("title") };
}

type Search = { id?: string; origin?: string; sort?: string; page?: string };

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const viewer = await requirePermission("news.review");
  const search = await searchParams;
  const t = await getTranslations("admin.review");
  const origin = search.origin === "user" || search.origin === "bot" ? search.origin : undefined;
  const sort = search.sort === "newest" ? "newest" : "oldest";
  const page = parsePage(search.page);

  const [{ items, total }, categories] = await Promise.all([
    listAdminNews({ status: "pending", origin, sort, page }),
    getAllCategories(),
  ]);
  const selectedId = search.id && items.some((item) => item.id === search.id) ? search.id : search.id ?? items[0]?.id;
  const selected = selectedId ? await getAdminNews(selectedId) : null;
  const index = items.findIndex((item) => item.id === selectedId);
  const next = items[index + 1] ?? items[index - 1];
  const baseQuery = { origin, sort: sort === "oldest" ? undefined : sort };
  const nextHref = next
    ? `/admin/review?${new URLSearchParams(Object.entries({ ...baseQuery, id: next.id }).filter(([, value]) => value) as [string, string][])}`
    : "/admin/review";

  const tabs = [
    { key: undefined, label: t("all"), icon: Inbox },
    { key: "user", label: t("readers"), icon: UserRound },
    { key: "bot", label: t("bot"), icon: Bot },
  ] as const;

  return (
    <div>
      <PageHeader title={t("title")} description={t("description", { count: total })} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={{ pathname: "/admin/review", query: Object.fromEntries(Object.entries({ origin: tab.key, sort: baseQuery.sort }).filter(([, v]) => v)) }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm",
              origin === tab.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            <tab.icon className="size-3.5" /> {tab.label}
          </Link>
        ))}
        <Link
          href={{ pathname: "/admin/review", query: Object.fromEntries(Object.entries({ origin, sort: sort === "oldest" ? "newest" : undefined }).filter(([, v]) => v)) }}
          className="ml-auto text-sm text-muted-foreground hover:text-foreground"
        >
          {sort === "oldest" ? t("sortOldest") : t("sortNewest")}
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyPanel title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div>
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={{ pathname: "/admin/review", query: Object.fromEntries(Object.entries({ ...baseQuery, id: item.id, page: page > 1 ? String(page) : undefined }).filter(([, v]) => v)) }}
                    className={cn("flex gap-3 p-3 transition-colors hover:bg-accent/60", item.id === selectedId && "bg-accent")}
                    aria-current={item.id === selectedId ? "true" : undefined}
                  >
                    <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.category.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-medium">{item.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {item.origin === "bot" ? <Bot className="size-3" /> : <UserRound className="size-3" />}
                        <span className="truncate">{item.sourceName ?? item.submitterName ?? "—"}</span>
                        <span>·</span>
                        <RelativeTime value={item.createdAt} />
                        {item.editorialScore != null ? <span>· {Math.round(item.editorialScore * 100)}%</span> : null}
                        {item.isSensitive ? <ShieldAlert className="size-3 text-destructive" /> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.locationLabel}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination pathname="/admin/review" query={baseQuery} page={page} pageSize={ADMIN_PAGE_SIZE} total={total} />
          </div>
          <div className="min-w-0">
            {selected ? (
              <NewsEditor key={selected.id} story={selected} categories={categories} canManage={can(viewer.role, "news.manage")} nextHref={nextHref} />
            ) : (
              <EmptyPanel title={t("notFound")} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
