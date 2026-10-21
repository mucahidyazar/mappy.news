import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Server-rendered pager that keeps the other query parameters. */
export async function Pagination({
  pathname,
  query,
  page,
  pageSize,
  total,
}: {
  pathname: string;
  query: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const t = await getTranslations("admin.common");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (target: number) => ({
    pathname,
    query: Object.fromEntries(Object.entries({ ...query, page: target > 1 ? String(target) : undefined }).filter(([, value]) => value)),
  });
  return (
    <nav className="mt-4 flex items-center justify-between gap-2 text-sm" aria-label={t("pagination")}>
      <span className="text-muted-foreground">{t("pageOf", { page, pages, total })}</span>
      <div className="flex gap-1">
        <Button asChild variant="outline" size="sm" aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : undefined}>
          <Link href={href(page - 1)}>
            <ChevronLeft className="size-4" /> {t("previous")}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" aria-disabled={page >= pages} className={page >= pages ? "pointer-events-none opacity-50" : undefined}>
          <Link href={href(page + 1)}>
            {t("next")} <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>
    </nav>
  );
}

export function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
}
