import { type Locale } from "@/i18n/routing";

export const SITE_NAME = "mappy.news";

/** Public origin used in metadata, sitemaps and emails. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Absolute URL for a locale-aware path ("/news/x" → "https://mappy.news/en/news/x"). */
export function absoluteUrl(path: string, locale: Locale = "tr"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const prefix = locale === "tr" ? "" : `/${locale}`;
  return `${siteUrl()}${prefix}${normalized === "/" && prefix ? "" : normalized}`;
}

export function localizedPath(path: string, locale: Locale): string {
  if (locale === "tr") return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
