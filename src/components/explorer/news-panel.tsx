"use client";

import { AlertCircle, MapPinned, RefreshCw, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryDTO, MapNewsItem } from "@/lib/news/types";

import { NewsListItem } from "./news-list-item";

export interface NewsPanelState {
  items: MapNewsItem[];
  totalInRange: number;
  isLoading: boolean;
  isError: boolean;
  truncated: boolean;
  hasActiveFilters: boolean;
}

interface NewsPanelBodyProps extends NewsPanelState {
  categories: Record<string, CategoryDTO>;
  selectedId: string | null;
  onSelect: (item: MapNewsItem) => void;
  onHover: (id: string | null) => void;
  onRetry: () => void;
  onShowAll: () => void;
  onClearFilters: () => void;
  onWiderRange: () => void;
}

export function NewsPanelBody({
  items,
  totalInRange,
  isLoading,
  isError,
  hasActiveFilters,
  categories,
  selectedId,
  onSelect,
  onHover,
  onRetry,
  onShowAll,
  onClearFilters,
  onWiderRange,
}: NewsPanelBodyProps) {
  const t = useTranslations("explorer");

  if (isLoading) {
    return (
      <ul className="flex flex-col gap-1 p-2" aria-busy="true" aria-label={t("loading")}>
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className="flex gap-3 p-2.5">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (isError) {
    return (
      <EmptyState icon={<AlertCircle />} title={t("errorTitle")} description={t("errorDescription")}>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="size-3.5" /> {t("retry")}
        </Button>
      </EmptyState>
    );
  }

  if (totalInRange === 0) {
    return (
      <EmptyState icon={<SearchX />} title={t("emptyTitle")} description={hasActiveFilters ? t("emptyFiltered") : t("emptyRange")}>
        <div className="flex flex-wrap justify-center gap-2">
          {hasActiveFilters ? (
            <Button size="sm" variant="outline" onClick={onClearFilters}>
              {t("clearFilters")}
            </Button>
          ) : null}
          <Button size="sm" onClick={onWiderRange}>
            {t("widerRange")}
          </Button>
        </div>
      </EmptyState>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState icon={<MapPinned />} title={t("emptyViewportTitle")} description={t("emptyViewport", { count: totalInRange })}>
        <Button size="sm" variant="outline" onClick={onShowAll}>
          {t("showAll")}
        </Button>
      </EmptyState>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 p-1.5">
      {items.map((item) => (
        <NewsListItem
          key={item.id}
          item={item}
          category={categories[item.categoryKey]}
          active={item.id === selectedId}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </ul>
  );
}

function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon}</span>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
