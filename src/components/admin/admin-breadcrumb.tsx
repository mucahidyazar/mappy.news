"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";

import { locateNav } from "./nav";

/** "İçerik › Haberler › Düzenle": where the page sits in the admin navigation. */
export function AdminBreadcrumb() {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();
  const found = locateNav(pathname);
  if (!found) return null;
  const { group, item, nested } = found;
  const isDashboard = item.href === "/admin";

  return (
    <nav aria-label={t("breadcrumb")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {isDashboard ? null : (
          <li className="hidden shrink-0 items-center gap-1.5 text-muted-foreground sm:flex">
            {t(group.label)}
            <ChevronRight className="size-3.5 opacity-50" aria-hidden />
          </li>
        )}
        <li className="flex min-w-0 items-center gap-1.5">
          {nested ? (
            <>
              <Link href={item.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                {t(item.label)}
              </Link>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-50" aria-hidden />
              <span className="truncate font-medium" aria-current="page">
                {t("detail")}
              </span>
            </>
          ) : (
            <span className="truncate font-medium" aria-current="page">
              {t(item.label)}
            </span>
          )}
        </li>
      </ol>
    </nav>
  );
}
