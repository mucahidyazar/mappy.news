import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { MapExplorer } from "@/components/explorer/map-explorer";
import { getCategories } from "@/server/categories";

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const categories = await getCategories().catch((error) => {
    console.error("[home] categories unavailable", error);
    return [];
  });

  return (
    <Suspense>
      <MapExplorer categories={categories} />
    </Suspense>
  );
}
