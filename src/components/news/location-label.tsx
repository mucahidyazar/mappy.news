"use client";

import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LocationPrecision } from "@/lib/domain/constants";
import { isMorePrecise } from "@/lib/domain/location";
import { cn } from "@/lib/utils";

/** Place name plus a "≈ district" hint when the position is only approximate. */
export function LocationLabel({
  label,
  precision,
  className,
  showIcon = true,
}: {
  label: string;
  precision: LocationPrecision;
  className?: string;
  showIcon?: boolean;
}) {
  const t = useTranslations("precision");
  const approximate = !isMorePrecise(precision, "district");

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      {showIcon ? <MapPin className="size-3.5 shrink-0" aria-hidden /> : null}
      <span className="truncate">{label}</span>
      {approximate ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0 cursor-help rounded border border-dashed border-current/40 px-1 text-[10px] leading-4 opacity-80">
              ≈ {t(`short.${precision}`)}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-60">{t("approximateHint", { level: t(`short.${precision}`) })}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}
