import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin({
  requestConfig: "./src/i18n/request.ts",
  // Generates messages/tr.d.json.ts so that message arguments are type-checked too.
  experimental: { createMessagesDeclaration: "./messages/tr.json" },
});

const isProduction = process.env.NODE_ENV === "production";
const isHttps = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");

/** Vector tiles and glyphs for the map (OpenFreeMap, no key required). */
const MAP_HOSTS = "https://tiles.openfreemap.org";
const tagManager = process.env.NEXT_PUBLIC_GTM_ID ? " https://*.googletagmanager.com https://*.google-analytics.com" : "";

/**
 * A nonce-free CSP keeps pages cacheable. Inline scripts are Next's own payload, the theme snippet and JSON-LD.
 * MapLibre runs its tile workers from blob: URLs. News images come from many publishers, so img-src stays open
 * but nothing else can be loaded cross-origin.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}${tagManager}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src * data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${MAP_HOSTS}${tagManager}${isProduction ? "" : " ws: wss:"}`,
  "worker-src 'self' blob:",
  "child-src blob:",
  "frame-src https://platform.twitter.com https://www.youtube-nocookie.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  ...(isProduction && isHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()" },
  ...(isProduction && isHttps ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // A browser on the previous release reloads instead of calling actions the new server no longer has.
  deploymentId: process.env.DEPLOYMENT_VERSION || process.env.SOURCE_COMMIT || undefined,
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
  // Fonts for the generated Open Graph images are read from disk at runtime.
  outputFileTracingIncludes: { "/**": ["./src/assets/fonts/**"] },
  images: {
    qualities: [75, 90],
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "pbs.twimg.com" },
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/terms-and-conditions", destination: "/terms", permanent: true },
      { source: "/terms-of-service", destination: "/terms", permanent: true },
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
