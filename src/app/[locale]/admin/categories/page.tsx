import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CategoryEditor } from "@/components/admin/category-editor";
import { PageHeader } from "@/components/admin/page-header";
import { CategoryBadgeIcon } from "@/components/icons/category-icon";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/session";
import { listCategoriesWithCounts } from "@/server/admin/moderation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.categories" });
  return { title: t("title") };
}

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("categories.manage");
  const t = await getTranslations("admin.categories");
  const rows = await listCategoriesWithCounts();

  return (
    <div>
      <PageHeader title={t("title")} description={t("description")} actions={<CategoryEditor />} />
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((category) => (
          <li key={category.id} className="flex items-start gap-3 rounded-2xl border bg-card p-4">
            <CategoryBadgeIcon icon={category.icon} color={category.color} className="size-10" iconClassName="size-5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{locale === "en" ? category.nameEn : category.nameTr}</p>
                <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{category.key}</code>
                {category.isSensitive ? (
                  <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                    <ShieldAlert className="size-3" /> {t("sensitiveBadge")}
                  </Badge>
                ) : null}
                {!category.isActive ? <Badge variant="secondary">{t("inactive")}</Badge> : null}
              </div>
              {category.aiHint ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{category.aiHint}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">{t("count", { count: category.newsCount })}</p>
            </div>
            <CategoryEditor category={category} />
          </li>
        ))}
      </ul>
    </div>
  );
}
