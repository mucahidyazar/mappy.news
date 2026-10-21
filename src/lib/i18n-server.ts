import { defaultLocale, isLocale, type Locale } from "@/i18n/routing";

/** The visitor's language for emails sent from auth callbacks: locale cookie, then Accept-Language. */
export function localeFromRequest(request?: Request | Headers | null): Locale {
  const headers = request instanceof Headers ? request : request?.headers;
  if (!headers) return defaultLocale;
  const cookie = headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)mappy_locale=([a-z]{2})/.exec(cookie);
  if (match && isLocale(match[1])) return match[1];
  const accept = headers.get("accept-language") ?? "";
  const first = accept.split(",")[0]?.trim().slice(0, 2).toLowerCase();
  return isLocale(first) ? first : defaultLocale;
}
