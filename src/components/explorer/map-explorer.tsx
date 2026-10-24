"use client";

import { List, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";

import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { type MapBounds, NewsMap } from "@/components/map/news-map";
import { CasualtyChips } from "@/components/news/casualties";
import { ReportButton } from "@/components/report/report-button";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useIsMobile } from "@/hooks/use-mobile";
import { zoomForPrecision } from "@/lib/domain/location";
import { incidentTotals } from "@/lib/news/casualties";
import type { CategoryDTO, MapNewsItem } from "@/lib/news/types";
import { cn } from "@/lib/utils";

import { CategoryChips, TimeRangePicker } from "./filter-bar";
import { NewsPanelBody } from "./news-panel";
import { ClusterList, NewsPreview } from "./news-preview";
import { SearchField } from "./search-field";
import { type ExplorerFilters, searchUpdateOptions, useExplorerFilters, useMapNews } from "./use-explorer";

const LIST_LIMIT = 200;
const PANEL_WIDTH = 368;

function inBounds(item: MapNewsItem, bounds: MapBounds) {
  return (
    item.latitude >= bounds.south &&
    item.latitude <= bounds.north &&
    item.longitude >= bounds.west &&
    item.longitude <= bounds.east
  );
}

export function MapExplorer({ categories }: { categories: CategoryDTO[] }) {
  const t = useTranslations("explorer");
  const isMobile = useIsMobile();
  const mapRef = useRef<MapRef | null>(null);
  const [filters, setFilters] = useExplorerFilters();
  const [searchInput, setSearchInput] = useState(filters.q);
  const debouncedQuery = useDebouncedValue(searchInput, 350);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(Boolean(filters.q));

  useEffect(() => {
    if (debouncedQuery !== filters.q) void setFilters({ q: debouncedQuery }, searchUpdateOptions);
  }, [debouncedQuery, filters.q, setFilters]);

  const effectiveFilters: ExplorerFilters = useMemo(
    () => ({ c: filters.c, range: filters.range, from: filters.from, to: filters.to, q: debouncedQuery }),
    [filters.c, filters.range, filters.from, filters.to, debouncedQuery],
  );
  const query = useMapNews(effectiveFilters);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  const categoryMap = useMemo(() => Object.fromEntries(categories.map((category) => [category.key, category])), [categories]);
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const item of items) result[item.categoryKey] = (result[item.categoryKey] ?? 0) + 1;
    return result;
  }, [items]);
  const visible = useMemo(() => (bounds ? items.filter((item) => inBounds(item, bounds)) : items), [items, bounds]);
  // Killed and injured in the incidents on screen, each incident counted once.
  const toll = useMemo(() => incidentTotals(visible), [visible]);
  const tCasualties = useTranslations("casualties");
  // A selection whose story dropped out of the results (new filters, refetch) simply stops showing.
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const padding = useMemo(
    () =>
      isMobile
        ? { top: 150, bottom: 220, left: 20, right: 20 }
        : { top: 150, bottom: 40, left: panelOpen ? PANEL_WIDTH + 40 : 40, right: 60 },
    [isMobile, panelOpen],
  );

  const focusItem = useCallback(
    (item: MapNewsItem) => {
      setSelectedId(item.id);
      setDrawerOpen(false);
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({
        center: [item.longitude, item.latitude],
        zoom: Math.max(map.getZoom(), zoomForPrecision(item.precision)),
        padding,
        duration: 900,
        essential: true,
      });
    },
    [padding],
  );

  const showAll = useCallback(() => {
    const map = mapRef.current;
    if (!map || items.length === 0) return;
    let west = 180;
    let south = 90;
    let east = -180;
    let north = -90;
    for (const item of items) {
      west = Math.min(west, item.longitude);
      east = Math.max(east, item.longitude);
      south = Math.min(south, item.latitude);
      north = Math.max(north, item.latitude);
    }
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding, maxZoom: 12, duration: 900 },
    );
  }, [items, padding]);

  const hasActiveFilters = filters.c.length > 0 || Boolean(debouncedQuery.trim());
  const clearFilters = useCallback(() => {
    setSearchInput("");
    void setFilters({ c: [], q: "" });
  }, [setFilters]);
  const widerRange = useCallback(() => {
    const order = ["24h", "7d", "30d", "90d"] as const;
    const index = order.indexOf(filters.range as (typeof order)[number]);
    void setFilters({ range: order[Math.min(order.length - 1, index + 1)] ?? "90d", from: null, to: null });
  }, [filters.range, setFilters]);

  const panelState = {
    items: visible.slice(0, LIST_LIMIT),
    totalInRange: items.length,
    isLoading: query.isPending,
    isError: query.isError,
    truncated: Boolean(query.data?.truncated),
    hasActiveFilters,
  };
  const panelHandlers = {
    categories: categoryMap,
    selectedId: selected?.id ?? null,
    onSelect: focusItem,
    onHover: setHoveredId,
    onRetry: () => void query.refetch(),
    onShowAll: showAll,
    onClearFilters: clearFilters,
    onWiderRange: widerRange,
  };

  const countLabel = query.isPending
    ? t("loading")
    : bounds && visible.length !== items.length
      ? t("inView", { visible: visible.length, total: items.length })
      : t("total", { count: items.length });

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-muted">
      <NewsMap
        mapRef={mapRef}
        items={items}
        categories={categoryMap}
        selectedId={selected?.id ?? null}
        hoveredId={hoveredId}
        onSelect={setSelectedId}
        onHover={setHoveredId}
        onBoundsChange={setBounds}
        renderPopup={(item) => (
          <NewsPreview item={item} category={categoryMap[item.categoryKey]} onClose={() => setSelectedId(null)} />
        )}
        renderClusterList={(clusterItems) => (
          <ClusterList items={clusterItems} categories={categoryMap} onSelect={focusItem} />
        )}
      />

      {/* Top overlay: header and filters */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] md:p-4">
        <header className="glass-panel pointer-events-auto flex h-14 items-center gap-2 rounded-2xl pr-2 pl-3">
          <Logo compact />
          <div className="mx-auto hidden w-full max-w-md md:block">
            <SearchField value={searchInput} onChange={setSearchInput} />
          </div>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileSearch((value) => !value)}
              aria-label={t("searchLabel")}
              aria-expanded={mobileSearch}
            >
              {mobileSearch ? <X className="size-[18px]" /> : <Search className="size-[18px]" />}
            </Button>
            <ReportButton className="hidden sm:inline-flex" />
            <ThemeToggle />
            <div className="hidden sm:block">
              <LocaleSwitcher />
            </div>
            <UserMenu />
          </div>
        </header>

        {mobileSearch ? (
          <div className="glass-panel pointer-events-auto rounded-xl p-1.5 md:hidden">
            <SearchField value={searchInput} onChange={setSearchInput} autoFocus className="bg-background" />
          </div>
        ) : null}

        <div className="pointer-events-auto flex items-center gap-2">
          <CategoryChips
            categories={categories}
            filters={filters}
            counts={counts}
            onChange={(patch) => void setFilters(patch)}
            className="min-w-0 flex-1"
          />
          <TimeRangePicker filters={filters} onChange={(patch) => void setFilters(patch)} className="hidden shrink-0 md:flex" />
        </div>
        <TimeRangePicker
          filters={filters}
          onChange={(patch) => void setFilters(patch)}
          className="pointer-events-auto self-start md:hidden"
        />
      </div>

      {/* Desktop list panel */}
      <aside
        className={cn(
          "glass-panel absolute bottom-4 left-4 z-10 hidden flex-col overflow-hidden rounded-2xl transition-[transform,opacity] duration-300 md:flex",
          "top-[8.5rem]",
          !panelOpen && "pointer-events-none -translate-x-[calc(100%+1rem)] opacity-0",
        )}
        style={{ width: PANEL_WIDTH }}
        aria-label={t("panelLabel")}
      >
        <div className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t("panelTitle")}</p>
            <p className="truncate text-xs text-muted-foreground" aria-live="polite">
              {countLabel}
            </p>
            {query.isPending ? null : <CasualtyChips deaths={toll.deaths} injured={toll.injured} label={tCasualties("inView")} className="mt-1 text-xs font-medium" />}
          </div>
          <div className="flex items-center gap-1">
            {query.isFetching && !query.isPending ? <Spinner className="size-4 text-muted-foreground" /> : null}
            <Button variant="ghost" size="icon-sm" onClick={() => setPanelOpen(false)} aria-label={t("hidePanel")}>
              <PanelLeftClose />
            </Button>
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <NewsPanelBody {...panelState} {...panelHandlers} />
          {visible.length > LIST_LIMIT ? (
            <p className="px-4 pb-4 text-center text-xs text-muted-foreground">
              {t("zoomForMore", { count: visible.length - LIST_LIMIT })}
            </p>
          ) : null}
          {panelState.truncated ? (
            <p className="px-4 pb-4 text-center text-xs text-muted-foreground">{t("truncated")}</p>
          ) : null}
        </div>
      </aside>
      {!panelOpen ? (
        <Button
          variant="outline"
          className="glass-panel absolute top-[8.5rem] left-4 z-10 hidden gap-2 rounded-xl md:inline-flex"
          onClick={() => setPanelOpen(true)}
        >
          <PanelLeftOpen className="size-4" /> {countLabel}
        </Button>
      ) : null}

      {/* Mobile: selected story card and list drawer */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:hidden">
        {selected ? (
          <div className="glass-panel pointer-events-auto rounded-2xl">
            <NewsPreview item={selected} category={categoryMap[selected.categoryKey]} onClose={() => setSelectedId(null)} />
          </div>
        ) : null}
        <div className="pointer-events-auto flex items-center gap-2">
          <Button variant="outline" className="glass-panel h-11 flex-1 justify-start gap-2 rounded-xl" onClick={() => setDrawerOpen(true)}>
            <List className="size-4" />
            <span className="truncate">{countLabel}</span>
            {query.isFetching ? <Spinner className="ml-auto size-4 text-muted-foreground" /> : null}
          </Button>
          <ReportButton className="h-11 rounded-xl" />
        </div>
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{t("panelTitle")}</DrawerTitle>
            <DrawerDescription>{countLabel}</DrawerDescription>
            <CasualtyChips deaths={toll.deaths} injured={toll.injured} label={tCasualties("inView")} className="text-xs font-medium" />
          </DrawerHeader>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <NewsPanelBody {...panelState} {...panelHandlers} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
