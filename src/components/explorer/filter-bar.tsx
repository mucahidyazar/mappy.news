"use client";

import { format, parseISO } from "date-fns";
import { CalendarRange, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";

import { CategoryIcon } from "@/components/icons/category-icon";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { categoryName } from "@/lib/news/format";
import type { TimeRange } from "@/lib/news/filters";
import type { CategoryDTO } from "@/lib/news/types";
import { cn } from "@/lib/utils";

import { type ExplorerFilters } from "./use-explorer";

const PRESETS: Exclude<TimeRange, "custom">[] = ["24h", "7d", "30d", "90d"];

interface FilterBarProps {
  categories: CategoryDTO[];
  filters: ExplorerFilters;
  counts: Record<string, number>;
  onChange: (patch: Partial<ExplorerFilters>) => void;
  className?: string;
}

export function CategoryChips({ categories, filters, counts, onChange, className }: FilterBarProps) {
  const t = useTranslations("filters");
  const locale = useLocale();
  const selected = new Set(filters.c);

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange({ c: [...next] });
  }

  return (
    <div
      className={cn(
        "scrollbar-none flex items-center gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_92%,transparent)] [scrollbar-width:none]",
        className,
      )}
      role="group"
      aria-label={t("categories")}
    >
      <button
        type="button"
        onClick={() => onChange({ c: [] })}
        aria-pressed={selected.size === 0}
        className={cn(
          "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors",
          selected.size === 0
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card/90 text-foreground hover:bg-accent",
        )}
      >
        {t("all")}
      </button>
      {categories.map((category) => {
        const active = selected.has(category.key);
        const count = counts[category.key] ?? 0;
        return (
          <button
            key={category.key}
            type="button"
            onClick={() => toggle(category.key)}
            aria-pressed={active}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border pr-3 pl-1 text-xs font-medium transition-colors",
              active ? "text-white shadow-sm" : "border-border bg-card/90 text-foreground hover:bg-accent",
            )}
            style={active ? { backgroundColor: category.color, borderColor: category.color } : undefined}
          >
            <span
              className="inline-flex size-6 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: active ? "rgb(255 255 255 / 0.2)" : category.color }}
            >
              <CategoryIcon icon={category.icon} className="size-3.5" />
            </span>
            {categoryName(category, locale)}
            {count > 0 ? (
              <span className={cn("tabular-nums", active ? "text-white/80" : "text-muted-foreground")}>{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TimeRangePicker({ filters, onChange, className }: Pick<FilterBarProps, "filters" | "onChange" | "className">) {
  const t = useTranslations("filters");
  const [open, setOpen] = useState(false);
  const range = useMemo<DateRange | undefined>(
    () =>
      filters.range === "custom" && filters.from
        ? { from: parseISO(filters.from), to: filters.to ? parseISO(filters.to) : undefined }
        : undefined,
    [filters.from, filters.range, filters.to],
  );
  const [draft, setDraft] = useState<DateRange | undefined>(range);

  const customLabel =
    filters.range === "custom" && filters.from
      ? `${format(parseISO(filters.from), "dd.MM")}${filters.to ? `–${format(parseISO(filters.to), "dd.MM")}` : ""}`
      : null;

  return (
    <div className={cn("flex items-center gap-1 rounded-full border border-border bg-card/90 p-0.5", className)}>
      <ToggleGroup
        type="single"
        size="sm"
        value={filters.range === "custom" ? "" : filters.range}
        onValueChange={(value) => {
          if (value) onChange({ range: value as TimeRange, from: null, to: null });
        }}
        aria-label={t("timeRange")}
        className="gap-0.5"
      >
        {PRESETS.map((preset) => (
          <ToggleGroupItem
            key={preset}
            value={preset}
            className="h-7 rounded-full px-2.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {t(`ranges.${preset}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setDraft(range);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 gap-1 rounded-full px-2 text-xs",
              filters.range === "custom" && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
            )}
            aria-label={t("customRange")}
          >
            <CalendarRange className="size-3.5" />
            {customLabel ? <span className="tabular-nums">{customLabel}</span> : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            numberOfMonths={1}
            selected={draft}
            onSelect={setDraft}
            disabled={{ after: new Date() }}
            defaultMonth={draft?.from}
          />
          <div className="flex items-center justify-between gap-2 border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange({ range: "7d", from: null, to: null });
                setOpen(false);
              }}
            >
              <X className="size-3.5" /> {t("clearRange")}
            </Button>
            <Button
              size="sm"
              disabled={!draft?.from}
              onClick={() => {
                if (!draft?.from) return;
                onChange({
                  range: "custom",
                  from: format(draft.from, "yyyy-MM-dd"),
                  to: draft.to ? format(draft.to, "yyyy-MM-dd") : null,
                });
                setOpen(false);
              }}
            >
              {t("applyRange")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
