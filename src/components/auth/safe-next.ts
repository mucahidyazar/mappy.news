/** Only same-site paths are allowed as a post-login destination ("/profile", not "//evil.com" or "https://..."). */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/^\/(?:en\/)?(?:sign-in|sign-up)(?:[/?#]|$)/.test(next)) return fallback;
  return next;
}
