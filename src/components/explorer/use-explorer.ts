"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  debounce,
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";

import { DEFAULT_RANGE, TIME_RANGES, type TimeRange } from "@/lib/news/filters";
import type { MapNewsResponse } from "@/lib/news/types";

const filterParsers = {
  c: parseAsArrayOf(parseAsString, ",").withDefault([]),
  range: parseAsStringLiteral(TIME_RANGES).withDefault(DEFAULT_RANGE),
  from: parseAsString,
  to: parseAsString,
  q: parseAsString.withDefault(""),
};

/** Map filters live in the URL so a filtered view can be shared. */
export function useExplorerFilters() {
  return useQueryStates(filterParsers, { history: "replace", shallow: true, clearOnDefault: true });
}

export const searchUpdateOptions = { limitUrlUpdates: debounce(350) } as const;

export interface ExplorerFilters {
  c: string[];
  range: TimeRange;
  from: string | null;
  to: string | null;
  q: string;
}

export function mapNewsSearchParams(filters: ExplorerFilters): URLSearchParams {
  const params = new URLSearchParams({ range: filters.range });
  if (filters.c.length) params.set("c", filters.c.join(","));
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.range === "custom" && filters.from) {
    params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
  }
  return params;
}

export function useMapNews(filters: ExplorerFilters) {
  const params = mapNewsSearchParams(filters).toString();
  return useQuery({
    queryKey: ["map-news", params],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/news/map?${params}`, { signal });
      if (!response.ok) throw new Error(`map news ${response.status}`);
      return (await response.json()) as MapNewsResponse;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });
}
