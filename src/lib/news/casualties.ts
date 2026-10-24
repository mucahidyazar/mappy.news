import type { MapNewsItem } from "./types";

export interface CasualtyTotals {
  deaths: number;
  injured: number;
  /** Incidents that reported anyone killed or injured. */
  incidents: number;
}

function higher(a: number | null, b: number | null) {
  return a == null ? b : b == null ? a : Math.max(a, b);
}

/**
 * Totals for a set of map stories. An incident and its updates are counted once, at the highest toll any of them
 * gives, so a death toll that rose from 1 to 3 adds 3, not 4.
 */
export function incidentTotals(items: Array<Pick<MapNewsItem, "rootId" | "deaths" | "injured">>): CasualtyTotals {
  const incidents = new Map<string, { deaths: number | null; injured: number | null }>();
  for (const item of items) {
    const known = incidents.get(item.rootId);
    incidents.set(item.rootId, { deaths: higher(known?.deaths ?? null, item.deaths), injured: higher(known?.injured ?? null, item.injured) });
  }
  const totals: CasualtyTotals = { deaths: 0, injured: 0, incidents: 0 };
  for (const toll of incidents.values()) {
    totals.deaths += toll.deaths ?? 0;
    totals.injured += toll.injured ?? 0;
    if (toll.deaths || toll.injured) totals.incidents += 1;
  }
  return totals;
}
