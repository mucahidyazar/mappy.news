"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { FeatureCollection, Point } from "geojson";
import type { ExpressionSpecification, Map as MaplibreMap } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { AttributionControl, Layer, type MapLayerMouseEvent, type MapRef, Source } from "react-map-gl/maplibre";

import maplibre from "@/components/map/maplibre";
import { basemapStyle, TURKEY_VIEW_BOUNDS } from "@/components/map/styles";
import { RelativeTime } from "@/components/news/relative-time";
import { useRouter } from "@/i18n/navigation";

export interface DeskPoint {
  id: string;
  title: string;
  status: "pending" | "published";
  latitude: number;
  longitude: number;
  color: string;
  at: string;
}

/**
 * Night and day palettes. The sea is also the hero card's background (--desk-sea in globals.css) so the map has
 * no visible edge and Türkiye reads as a lit shape on it; keep the two in sync.
 */
const PALETTES = {
  dark: { sea: "#0a1322", land: "#16263d", province: "rgba(143,180,255,0.13)", country: "rgba(143,180,255,0.42)", pending: "#ffb547", glow: 0.34 },
  light: { sea: "#e9eff8", land: "#ffffff", province: "rgba(2,40,89,0.09)", country: "rgba(2,40,89,0.32)", pending: "#dd8500", glow: 0.2 },
} as const;

type Palette = (typeof PALETTES)[keyof typeof PALETTES];

/** Keeps land, water and borders (country and the 81 provinces); labels, roads and buildings go. */
function restyle(map: MaplibreMap, palette: Palette) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.id.startsWith("desk-")) continue;
    if (layer.id === "background") map.setPaintProperty(layer.id, "background-color", palette.land);
    else if (layer.id === "water") map.setPaintProperty(layer.id, "fill-color", palette.sea);
    else if (layer.id.startsWith("boundary") && layer.type === "line") {
      const country = /country|boundary_2/.test(layer.id);
      map.setPaintProperty(layer.id, "line-color", country ? palette.country : palette.province);
      map.setPaintProperty(layer.id, "line-width", country ? 1.1 : 0.7);
    } else map.setLayoutProperty(layer.id, "visibility", "none");
  }
}

function paddingFor(width: number) {
  // Wide cards keep Türkiye clear of the text on the left.
  return width >= 880 ? { top: 40, bottom: 52, left: Math.round(width * 0.42), right: 32 } : { top: 18, bottom: 18, left: 14, right: 14 };
}

const PUBLISHED: ExpressionSpecification = ["==", ["get", "pending"], false];
const PENDING: ExpressionSpecification = ["==", ["get", "pending"], true];
const POINT_LAYERS = [
  ["desk-glow", PUBLISHED],
  ["desk-dot", PUBLISHED],
  ["desk-pulse", PENDING],
  ["desk-pending", PENDING],
] as const;

export function DeskMap({ points }: { points: DeskPoint[] }) {
  const t = useTranslations("admin.dashboard");
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "light" ? "light" : "dark";
  const palette = PALETTES[theme];
  const router = useRouter();
  const mapRef = useRef<MapRef | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [loadedTheme, setLoadedTheme] = useState<string | null>(null);
  const ready = loadedTheme === theme;
  const [hover, setHover] = useState<{ point: DeskPoint; x: number; y: number } | null>(null);

  const byId = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);
  const data = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: points.map((point, order) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
        properties: { id: point.id, order, color: point.color, pending: point.status === "pending" },
      })),
    }),
    [points],
  );

  // Measured once for the first fit; later sizes refit directly.
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0);
      mapRef.current?.getMap().fitBounds(TURKEY_VIEW_BOUNDS, { padding: paddingFor(next), duration: 0 });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    restyle(map, palette);
    // A static map never collapses MapLibre's compact attribution; fold it into its "i" button on narrow cards.
    if (map.getContainer().clientWidth < 640) map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    setLoadedTheme(theme);
  }, [palette, theme]);

  // Arrival: stories appear in the order they came in; waiting ones then keep breathing.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!ready || !map) return;
    const reveal = (count: number) => {
      for (const [id, base] of POINT_LAYERS) {
        if (map.getLayer(id)) map.setFilter(id, ["all", base, ["<", ["get", "order"], count]]);
      }
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      reveal(points.length);
      return;
    }
    let frame = 0;
    let revealing = true;
    const started = performance.now();
    const tick = (now: number) => {
      if (revealing) {
        const progress = Math.min(1, (now - started) / 1400);
        reveal(Math.ceil(progress * points.length));
        revealing = progress < 1;
      }
      const phase = ((now - started) % 2600) / 2600;
      if (map.getLayer("desk-pulse")) {
        map.setPaintProperty("desk-pulse", "circle-radius", 6 + 15 * phase);
        map.setPaintProperty("desk-pulse", "circle-stroke-opacity", 0.9 * (1 - phase));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, points.length]);

  const pick = (event: MapLayerMouseEvent) => {
    const id = event.features?.[0]?.properties?.id;
    return typeof id === "string" ? byId.get(id) : undefined;
  };

  const initialView = useMemo(() => (width ? { bounds: TURKEY_VIEW_BOUNDS, fitBoundsOptions: { padding: paddingFor(width) } } : undefined), [width]);

  return (
    <div ref={containerRef} className="relative size-full" role="img" aria-label={t("mapLabel")}>
      {initialView ? (
        <MapGL
          key={theme}
          ref={mapRef}
          mapLib={maplibre}
          mapStyle={basemapStyle(theme, "minimal")}
          initialViewState={initialView}
          onLoad={handleLoad}
          renderWorldCopies={false}
          dragPan={false}
          dragRotate={false}
          scrollZoom={false}
          doubleClickZoom={false}
          touchZoomRotate={false}
          touchPitch={false}
          boxZoom={false}
          keyboard={false}
          attributionControl={false}
          interactiveLayerIds={ready ? ["desk-dot", "desk-pending"] : []}
          cursor={hover ? "pointer" : "default"}
          onMouseMove={(event) => {
            const point = pick(event);
            setHover(point ? { point, x: event.point.x, y: event.point.y } : null);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={(event) => {
            const point = pick(event);
            if (point) router.push(point.status === "pending" ? `/admin/review?id=${point.id}` : `/admin/news/${point.id}`);
          }}
          style={{ width: "100%", height: "100%", opacity: ready ? 1 : 0, transition: "opacity 600ms ease" }}
        >
          <AttributionControl position="bottom-right" />
          {ready ? (
            <Source id="desk-points" type="geojson" data={data}>
              <Layer id="desk-glow" type="circle" filter={PUBLISHED} paint={{ "circle-radius": 14, "circle-color": ["get", "color"], "circle-opacity": palette.glow, "circle-blur": 0.9 }} />
              <Layer id="desk-dot" type="circle" filter={PUBLISHED} paint={{ "circle-radius": 4.6, "circle-color": ["get", "color"], "circle-stroke-width": 1.5, "circle-stroke-color": palette.sea }} />
              <Layer id="desk-pulse" type="circle" filter={PENDING} paint={{ "circle-radius": 9, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 1.4, "circle-stroke-color": palette.pending, "circle-stroke-opacity": 0.6 }} />
              <Layer id="desk-pending" type="circle" filter={PENDING} paint={{ "circle-radius": 5.2, "circle-color": palette.pending, "circle-stroke-width": 1.8, "circle-stroke-color": palette.sea }} />
            </Source>
          ) : null}
        </MapGL>
      ) : null}

      {hover ? (
        <div
          className="pointer-events-none absolute z-20 w-60 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl border bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur"
          style={{ left: hover.x, top: hover.y }}
        >
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {hover.point.status === "pending" ? t("tooltipPending") : t("tooltipPublished")} · <RelativeTime value={hover.point.at} />
          </p>
          <p className="mt-1 line-clamp-2 text-sm leading-snug font-medium">{hover.point.title}</p>
        </div>
      ) : null}
    </div>
  );
}
