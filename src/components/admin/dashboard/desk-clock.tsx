"use client";

import { useFormatter, useNow } from "next-intl";

/** "Çarşamba, 21 Ekim · 21:04 TRT": the desk's clock, in Türkiye time. */
export function DeskClock({ className }: { className?: string }) {
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  return (
    <time dateTime={now.toISOString()} className={className} suppressHydrationWarning>
      {format.dateTime(now, { weekday: "long", day: "numeric", month: "long" })} · {format.dateTime(now, { hour: "2-digit", minute: "2-digit" })} TRT
    </time>
  );
}
