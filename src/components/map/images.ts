import type { Map as MapLibreMap } from "maplibre-gl";

import { CATEGORY_ICON_PATHS, isCategoryIconKey } from "@/components/icons/category-icon-paths";

export const ICON_PREFIX = "cat-";
const ICON_CSS_SIZE = 16;

/** Draws a category glyph in white onto a canvas and registers it with the map as `cat-<icon>`. */
export function addCategoryImage(map: MapLibreMap, imageId: string): boolean {
  if (!imageId.startsWith(ICON_PREFIX) || map.hasImage(imageId)) return false;
  const key = imageId.slice(ICON_PREFIX.length);
  const glyph = CATEGORY_ICON_PATHS[isCategoryIconKey(key) ? key : "newspaper-sharp"];
  const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  const size = Math.round(ICON_CSS_SIZE * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return false;

  const scale = size / Math.max(glyph.width, glyph.height);
  context.translate((size - glyph.width * scale) / 2, (size - glyph.height * scale) / 2);
  context.scale(scale, scale);
  context.fillStyle = "#ffffff";
  for (const path of glyph.paths) if (!("hole" in path)) context.fill(new Path2D(path.d));
  context.globalCompositeOperation = "destination-out";
  for (const path of glyph.paths) if ("hole" in path) context.fill(new Path2D(path.d));

  map.addImage(imageId, context.getImageData(0, 0, size, size), { pixelRatio: ratio });
  return true;
}
