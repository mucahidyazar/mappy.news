import Link from "next/link";

import "./globals.css";

/** Paths outside any locale (rare: the proxy localizes everything else). */
export default function RootNotFound() {
  return (
    <html lang="tr">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-center font-sans text-foreground">
        <p className="text-sm text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold">Sayfa bulunamadı · Page not found</h1>
        <Link href="/" className="text-sm underline underline-offset-4">
          mappy.news
        </Link>
      </body>
    </html>
  );
}
