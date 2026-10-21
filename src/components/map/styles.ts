/** OpenFreeMap vector styles: free, keyless, attribution included in the style. */
const BASE = "https://tiles.openfreemap.org/styles";

export type BasemapVariant = "minimal" | "detailed";

export function basemapStyle(theme: "light" | "dark", variant: BasemapVariant): string {
  if (variant === "detailed") return `${BASE}/${theme === "dark" ? "fiord" : "liberty"}`;
  return `${BASE}/${theme === "dark" ? "dark" : "positron"}`;
}

/** Turkey fits the viewport at this zoom on a laptop; phones zoom out one step. */
export const INITIAL_VIEW = { longitude: 35.2, latitude: 39.0, zoom: 5.4 } as const;
/** Mainland Turkey, fitted into the visible part of the map on first load. */
export const TURKEY_VIEW_BOUNDS: [[number, number], [number, number]] = [
  [25.7, 35.8],
  [44.8, 42.1],
];

/**
 * [west, south, east, north]: keeps panning around Turkey and its neighbours. Tall enough that a portrait phone
 * (≈800 px high) can zoom out until all of Turkey fits its width; MapLibre won't zoom out past these bounds.
 */
export const MAP_MAX_BOUNDS: [number, number, number, number] = [10, 16, 62, 58];

/** Phones need about 3.5 to show the whole country. */
export const MAP_MIN_ZOOM = 3;
