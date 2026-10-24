"use client";

import { Layers, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { CategoryBadgeIcon } from "@/components/icons/category-icon";
import { CasualtyChips } from "@/components/news/casualties";
import { LocationLabel } from "@/components/news/location-label";
import { RelativeTime } from "@/components/news/relative-time";
import type { CategoryDTO, MapNewsItem } from "@/lib/news/types";
import { cn } from "@/lib/utils";

interface NewsListItemProps {
  item: MapNewsItem;
  category: CategoryDTO | undefined;
  active: boolean;
  onSelect: (item: MapNewsItem) => void;
  onHover: (id: string | null) => void;
}

export const NewsListItem = memo(function NewsListItem({ item, category, active, onSelect, onHover }: NewsListItemProps) {
  const t = useTranslations("news");

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item)}
        onMouseEnter={() => onHover(item.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(item.id)}
        onBlur={() => onHover(null)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "group flex w-full gap-3 rounded-xl border border-transparent p-2.5 text-left transition-colors outline-none",
          "hover:bg-accent/70 focus-visible:ring-3 focus-visible:ring-ring/40",
          active && "border-border bg-accent",
        )}
      >
        <CategoryBadgeIcon icon={category?.icon ?? "newspaper-sharp"} color={category?.color ?? "#2563EB"} className="mt-0.5" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 text-sm leading-snug font-medium">{item.title}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <LocationLabel label={item.locationLabel} precision={item.precision} className="min-w-0" />
            <span aria-hidden>·</span>
            <RelativeTime value={item.occurredAt} className="shrink-0" />
          </span>
          <span className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
            <CasualtyChips deaths={item.deaths} injured={item.injured} className="shrink-0 font-medium text-foreground/80" />
            {item.sourceName ? <span className="truncate">{item.sourceName}</span> : null}
            {item.citationCount > 1 ? (
              <span className="inline-flex shrink-0 items-center gap-0.5" title={t("citations", { count: item.citationCount })}>
                <Layers className="size-3" /> {item.citationCount}
              </span>
            ) : null}
            {item.commentCount > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-0.5">
                <MessageCircle className="size-3" /> {item.commentCount}
              </span>
            ) : null}
            {item.hasFollowUps ? (
              <span className="shrink-0 rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">{t("developing")}</span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
});
