"use client";

import { useFormatter, useNow } from "next-intl";

/** "2 saat önce", refreshed every minute; the exact time is in the title and the datetime attribute. */
export function RelativeTime({ value, className }: { value: string | Date; className?: string }) {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const date = typeof value === "string" ? new Date(value) : value;
  return (
    <time
      dateTime={date.toISOString()}
      title={format.dateTime(date, { dateStyle: "long", timeStyle: "short" })}
      className={className}
      suppressHydrationWarning
    >
      {format.relativeTime(date, now)}
    </time>
  );
}
