"use client";

import dynamic from "next/dynamic";

/** MapLibre is browser-only and heavy: load the desk map after the page itself. */
export const DeskMapLoader = dynamic(() => import("./desk-map").then((module) => module.DeskMap), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-foreground/[0.03]" />,
});
