import "server-only";

import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import type { CategoryDTO } from "@/lib/news/types";

export const CATEGORIES_TAG = "categories";

async function loadCategories(includeInactive: boolean): Promise<CategoryDTO[]> {
  const rows = await db
    .select({
      id: categories.id,
      key: categories.key,
      nameTr: categories.nameTr,
      nameEn: categories.nameEn,
      color: categories.color,
      icon: categories.icon,
      isSensitive: categories.isSensitive,
      sortOrder: categories.sortOrder,
      isActive: categories.isActive,
    })
    .from(categories)
    .where(includeInactive ? undefined : eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.nameTr));
  return rows.map(({ isActive: _isActive, ...category }) => category);
}

/** Active categories, cached until an editor changes them. */
export const getCategories = unstable_cache(() => loadCategories(false), ["categories:active"], {
  tags: [CATEGORIES_TAG],
  revalidate: 3600,
});

export function getAllCategories() {
  return loadCategories(true);
}
