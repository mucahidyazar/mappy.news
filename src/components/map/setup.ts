"use client";

import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";

import { CATEGORY_ICON_PATHS } from "@/components/icons/category-icon-paths";

import { addCategoryImage, ICON_PREFIX } from "./images";

const prepared = new WeakSet<MapLibreMap>();

/** Label in the visitor's language, falling back to the local (mostly Turkish) name. */
function labelExpression(locale: string): ExpressionSpecification {
  return locale === "en"
    ? ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name"]]
    : ["coalesce", ["get", `name:${locale}`], ["get", "name"]];
}

function localizeLabels(map: MapLibreMap, locale: string) {
  const style = map.getStyle();
  for (const layer of style.layers ?? []) {
    if (layer.type !== "symbol") continue;
    const field = map.getLayoutProperty(layer.id, "text-field");
    if (!field || !JSON.stringify(field).includes("name")) continue;
    map.setLayoutProperty(layer.id, "text-field", labelExpression(locale));
  }
}

/**
 * Runs once per map instance, before the style finishes loading: registers category icons on demand and
 * switches basemap labels to the page language every time a style is (re)loaded.
 */
export function prepareMap(map: MapLibreMap, locale: string) {
  if (prepared.has(map)) return;
  prepared.add(map);
  if (process.env.NODE_ENV === "development") {
    (window as unknown as { __mappyMaps?: MapLibreMap[] }).__mappyMaps = [
      ...((window as unknown as { __mappyMaps?: MapLibreMap[] }).__mappyMaps ?? []),
      map,
    ];
  }
  const onStyle = () => {
    // Icons must exist before symbols are laid out, otherwise those symbols are dropped for the tile.
    for (const key of Object.keys(CATEGORY_ICON_PATHS)) addCategoryImage(map, `${ICON_PREFIX}${key}`);
    localizeLabels(map, locale);
  };
  map.on("styleimagemissing", (event) => {
    addCategoryImage(map, event.id);
  });
  map.on("style.load", onStyle);
  if (map.isStyleLoaded()) onStyle();
}
