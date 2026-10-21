import type { CategoryDTO } from "./types";

export function categoryName(category: Pick<CategoryDTO, "nameTr" | "nameEn">, locale: string) {
  return locale === "en" ? category.nameEn : category.nameTr;
}

export function newsPath(slug: string) {
  return `/news/${slug}`;
}

/** Host name without "www." for showing where a link points. */
export function hostLabel(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
