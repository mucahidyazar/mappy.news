"use client";

import { useTranslations } from "next-intl";

import { rankFor } from "@/lib/domain/ranks";
import { cn } from "@/lib/utils";

export function RankBadge({ points, className, showPoints = false }: { points: number; className?: string; showPoints?: boolean }) {
  const t = useTranslations("ranks");
  const rank = rankFor(points);
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none font-medium", className)}
      style={{ borderColor: `${rank.color}55`, color: rank.color, backgroundColor: `${rank.color}14` }}
      title={t(rank.key)}
    >
      <span aria-hidden>{rank.icon}</span>
      {t(rank.key)}
      {showPoints ? <span className="opacity-70">· {points}</span> : null}
    </span>
  );
}
