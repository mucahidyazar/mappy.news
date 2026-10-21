import { AlertTriangle, AtSign, Rss } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SourceDialog } from "@/components/admin/bot/source-dialog";
import { SourceRowActions, SourceSwitch } from "@/components/admin/bot/source-row-actions";
import { EmptyPanel, PageHeader } from "@/components/admin/page-header";
import { RelativeTime } from "@/components/news/relative-time";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { hostLabel } from "@/lib/news/format";
import { listSourcesWithStats } from "@/server/admin/bot";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.sources" });
  return { title: t("title") };
}

export default async function SourcesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const viewer = await requirePermission("bot.view");
  const canManage = can(viewer.role, "bot.manage");
  const t = await getTranslations("admin.sources");
  const rows = (await listSourcesWithStats()).filter((source) => source.kind !== "web");

  return (
    <div>
      <PageHeader title={t("title")} description={t("description")} actions={canManage ? <SourceDialog /> : null} />
      {rows.length === 0 ? (
        <EmptyPanel title={t("empty")} description={t("emptyDescription")} />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.source")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("columns.health")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("columns.last24h")}</TableHead>
                <TableHead className="text-center">{t("columns.active")}</TableHead>
                <TableHead className="hidden text-center sm:table-cell">{t("columns.autoPublish")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((source) => (
                <TableRow key={source.id} className={source.isActive ? undefined : "opacity-60"}>
                  <TableCell>
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {source.kind === "x" ? <AtSign className="size-4" /> : <Rss className="size-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 font-medium">
                          {source.name}
                          <Badge variant="outline" className="text-[10px]">
                            {t(`trustLevels.${source.trust}`)}
                          </Badge>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {source.kind === "x" ? `@${source.handle}` : hostLabel(source.url)} · {t("every", { minutes: source.pollIntervalMinutes })}
                          {source.keywordFilter.length ? ` · ${t("filtered", { count: source.keywordFilter.length })}` : ""}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    {source.failStreak > 0 ? (
                      <Tooltip>
                        <TooltipTrigger className="inline-flex items-center gap-1 text-destructive">
                          <AlertTriangle className="size-3.5" /> {t("failing", { count: source.failStreak })}
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{source.lastError}</TooltipContent>
                      </Tooltip>
                    ) : source.lastSuccessAt ? (
                      <span className="text-muted-foreground">
                        {t("lastSuccess")} <RelativeTime value={source.lastSuccessAt} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("neverPolled")}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    {t("stats", { items: source.items24h, stories: source.stories24h })}
                  </TableCell>
                  <TableCell className="text-center">
                    <SourceSwitch id={source.id} field="isActive" value={source.isActive} label={t("columns.active")} disabled={!canManage} />
                  </TableCell>
                  <TableCell className="hidden text-center sm:table-cell">
                    <SourceSwitch id={source.id} field="autoPublish" value={source.autoPublish} label={t("columns.autoPublish")} disabled={!canManage} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      {canManage ? <SourceDialog source={source} /> : null}
                      <SourceRowActions id={source.id} name={source.name} canManage={canManage} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}
