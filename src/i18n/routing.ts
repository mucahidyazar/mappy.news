import { defineRouting } from "next-intl/routing";

export const locales = ["tr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "tr";

/** Turkish lives at unprefixed URLs ("/news/..."), English under "/en". */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
  // "/" is always Turkish (also for crawlers); visitors switch language with the language menu.
  localeDetection: false,
  localeCookie: { name: "mappy_locale", maxAge: 60 * 60 * 24 * 365 },
});

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
