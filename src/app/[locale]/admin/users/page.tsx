import { Ban, MailWarning } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { EmptyPanel, PageHeader } from "@/components/admin/page-header";
import { Pagination, parsePage } from "@/components/admin/pagination";
import { UrlFilters } from "@/components/admin/url-filters";
import { UserActions } from "@/components/admin/user-actions";
import { UserAvatar } from "@/components/layout/user-menu";
import { RelativeTime } from "@/components/news/relative-time";
import { RankBadge } from "@/components/profile/rank-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/session";
import { USER_ROLES } from "@/lib/domain/constants";
import { getBanHistories, listUsersForAdmin, PAGE_SIZE } from "@/server/admin/moderation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.users" });
  return { title: t("title") };
}

export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; role?: string; banned?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const admin = await requirePermission("users.manage");
  const search = await searchParams;
  const t = await getTranslations("admin.users");
  const format = await getFormatter();
  const page = parsePage(search.page);
  const role = (USER_ROLES as readonly string[]).includes(search.role ?? "") ? search.role : undefined;
  const banned = search.banned === "yes" ? true : search.banned === "no" ? false : undefined;
  const { items, total } = await listUsersForAdmin({ q: search.q?.slice(0, 80), role, banned, page });
  const histories = await getBanHistories(items.map((item) => item.id));

  return (
    <div>
      <PageHeader title={t("title")} description={t("description", { count: total })} />
      <UrlFilters
        searchPlaceholder={t("search")}
        selects={[
          { name: "role", label: t("allRoles"), options: USER_ROLES.map((value) => ({ value, label: t(`roles.${value}`) })) },
          { name: "banned", label: t("allStates"), options: [{ value: "yes", label: t("bannedOnly") }, { value: "no", label: t("activeOnly") }] },
        ]}
      />
      {items.length === 0 ? (
        <EmptyPanel title={t("empty")} />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.user")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("columns.role")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("columns.activity")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("columns.joined")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar name={item.name} image={item.image} className="size-8" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium">
                          {item.name}
                          {!item.emailVerified ? <MailWarning className="size-3.5 text-warning" aria-label={t("unverified")} /> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{item.email}</p>
                        {item.banned ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                            <Ban className="size-3" />
                            {item.banExpires
                              ? t("bannedUntil", { date: format.dateTime(new Date(item.banExpires), { dateStyle: "medium", timeStyle: "short" }) })
                              : t("bannedPermanently")}
                            {item.banReason ? ` · ${item.banReason}` : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={item.role === "user" ? "outline" : "secondary"}>{t(`roles.${item.role === "admin" || item.role === "moderator" ? item.role : "user"}`)}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    <div className="flex flex-wrap items-center gap-2">
                      <RankBadge points={item.points} showPoints />
                      <span>{t("reports", { published: item.publishedReportCount, total: item.reportCount })}</span>
                      <span>{t("comments", { count: item.commentCount })}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                    <RelativeTime value={item.createdAt} />
                  </TableCell>
                  <TableCell>
                    <UserActions
                      target={{ id: item.id, name: item.name, role: item.role, banned: item.banned }}
                      isSelf={item.id === admin.id}
                      history={histories.get(item.id) ?? []}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination pathname="/admin/users" query={{ q: search.q, role, banned: search.banned }} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
