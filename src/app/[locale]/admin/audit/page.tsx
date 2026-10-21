import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { EmptyPanel, PageHeader } from "@/components/admin/page-header";
import { Pagination, parsePage } from "@/components/admin/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translateDynamic } from "@/i18n/dynamic";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/session";
import { listAuditLogs, PAGE_SIZE } from "@/server/admin/moderation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.audit" });
  return { title: t("title") };
}

export default async function AuditPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("audit.view");
  const page = parsePage((await searchParams).page);
  const t = await getTranslations("admin.audit");
  const format = await getFormatter();
  const { items, total } = await listAuditLogs(page);

  return (
    <div>
      <PageHeader title={t("title")} description={t("description")} />
      {items.length === 0 ? (
        <EmptyPanel title={t("empty")} />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.when")}</TableHead>
                <TableHead>{t("columns.actor")}</TableHead>
                <TableHead>{t("columns.action")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("columns.details")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                    {format.dateTime(new Date(item.createdAt), { dateStyle: "short", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="text-sm">{item.actorName ?? t("system")}</TableCell>
                  <TableCell>
                    <span className="text-sm">{translateDynamic(t, `actions.${item.action}`) ?? item.action}</span>
                    {item.targetType === "news" && item.targetId ? (
                      <Link href={`/admin/news/${item.targetId}`} className="ml-2 text-xs text-muted-foreground hover:underline">
                        {t("open")}
                      </Link>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden max-w-sm truncate font-mono text-[11px] text-muted-foreground md:table-cell">
                    {Object.keys(item.data ?? {}).length ? JSON.stringify(item.data) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination pathname="/admin/audit" query={{}} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
