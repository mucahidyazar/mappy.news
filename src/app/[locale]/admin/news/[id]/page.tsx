import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";

import { NewsEditor } from "@/components/admin/news-editor";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { getAdminNews } from "@/server/admin/news";
import { getAllCategories } from "@/server/categories";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.news" });
  return { title: t("editTitle") };
}

export default async function AdminNewsPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const viewer = await requirePermission("news.review");
  if (!z.uuid().safeParse(id).success) notFound();
  const [story, categories] = await Promise.all([getAdminNews(id), getAllCategories()]);
  if (!story) notFound();
  const t = await getTranslations("admin.news");

  return (
    <div className="max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3 gap-1.5 text-muted-foreground">
        <Link href={story.status === "pending" ? { pathname: "/admin/review", query: { id: story.id } } : "/admin/news"}>
          <ArrowLeft className="size-4" /> {story.status === "pending" ? t("backToQueue") : t("backToList")}
        </Link>
      </Button>
      <NewsEditor story={story} categories={categories} canManage={can(viewer.role, "news.manage")} />
    </div>
  );
}
