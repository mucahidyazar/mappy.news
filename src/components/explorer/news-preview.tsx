"use client";

import { ArrowRight, Layers, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { CategoryIcon } from "@/components/icons/category-icon";
import { LocationLabel } from "@/components/news/location-label";
import { RelativeTime } from "@/components/news/relative-time";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { categoryName, newsPath } from "@/lib/news/format";
import type { CategoryDTO, MapNewsItem } from "@/lib/news/types";
import { cn } from "@/lib/utils";

export function NewsPreview({
  item,
  category,
  onClose,
  className,
}: {
  item: MapNewsItem;
  category: CategoryDTO | undefined;
  onClose: () => void;
  className?: string;
}) {
  const t = useTranslations("news");
  const locale = useLocale();
  const color = category?.color ?? "#2563EB";

  return (
    <article className={cn("flex w-full flex-col gap-2.5 p-3.5", className)}>
      <header className="flex items-start justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          <CategoryIcon icon={category?.icon ?? "newspaper-sharp"} className="size-3" />
          {category ? categoryName(category, locale) : null}
        </span>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label={t("closePreview")} className="-mt-1 -mr-1">
          <X />
        </Button>
      </header>
      {item.imageUrl ? (
        // External publisher images are shown as-is; they are not proxied through the image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="aspect-[16/8] w-full rounded-lg bg-muted object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <h3 className="text-[15px] leading-snug font-semibold text-balance">{item.title}</h3>
      {item.summary ? <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{item.summary}</p> : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <LocationLabel label={item.locationLabel} precision={item.precision} />
        <span aria-hidden>·</span>
        <RelativeTime value={item.occurredAt} />
      </div>
      <footer className="mt-0.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {item.sourceName ? <span className="truncate">{item.sourceName}</span> : null}
          {item.citationCount > 1 ? (
            <span className="inline-flex shrink-0 items-center gap-0.5">
              <Layers className="size-3" /> {t("citations", { count: item.citationCount })}
            </span>
          ) : null}
        </span>
        <Button asChild size="sm" className="shrink-0 gap-1">
          <Link href={newsPath(item.slug)}>
            {t("details")} <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </footer>
    </article>
  );
}

export function ClusterList({
  items,
  categories,
  onSelect,
}: {
  items: MapNewsItem[];
  categories: Record<string, CategoryDTO>;
  onSelect: (item: MapNewsItem) => void;
}) {
  const t = useTranslations("explorer");
  return (
    <div className="flex max-h-72 w-72 flex-col">
      <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">{t("samePlace", { count: items.length })}</p>
      <ul className="scrollbar-thin overflow-y-auto p-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-accent"
            >
              <span
                className="mt-1 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: categories[item.categoryKey]?.color ?? "#2563EB" }}
              />
              <span className="line-clamp-2">{item.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
