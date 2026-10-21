import "./globals.css";

import type { ReactNode } from "react";

/** The localized layout in [locale] renders <html>; this file exists because the root not-found page needs it. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
