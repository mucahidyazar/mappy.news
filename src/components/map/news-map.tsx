"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { FeatureCollection, Point } from "geojson";
import type { GeoJSONSource } from "maplibre-gl";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { type ReactNode, type RefObject, useCallback, useMemo, useState } from "react";
import MapGL, {
  AttributionControl,
  GeolocateControl,
  Layer,
  type LayerProps,
  type MapLayerMouseEvent,
  type MapRef,
  NavigationControl,
  Popup,
  Source,
} from "react-map-gl/maplibre";

import { isMorePrecise, uncertaintyRadiusMeters } from "@/lib/domain/location";
import type { CategoryDTO, MapNewsItem } from "@/lib/news/types";

import { circlePolygon } from "./geo";
import maplibre from "./maplibre";
import { ICON_PREFIX } from "./images";
import { prepareMap } from "./setup";
import { type BasemapVariant, basemapStyle, MAP_MAX_BOUNDS, MAP_MIN_ZOOM, TURKEY_VIEW_BOUNDS } from "./styles";

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

const SOURCE_ID = "news";
const CLUSTER_MAX_ZOOM = 14;
const DEFAULT_COLOR = "#2563EB";

interface NewsMapProps {
  items: MapNewsItem[];
  categories: Record<string, CategoryDTO>;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
  mapRef: RefObject<MapRef | null>;
  basemap?: BasemapVariant;
  renderPopup?: (item: MapNewsItem) => ReactNode;
  renderClusterList?: (items: MapNewsItem[]) => ReactNode;
  children?: ReactNode;
}

function readBounds(map: MapRef): MapBounds {
  const bounds = map.getBounds();
  return { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() };
}

export function NewsMap({
  items,
  categories,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onBoundsChange,
  mapRef,
  basemap = "minimal",
  renderPopup,
  renderClusterList,
  children,
}: NewsMapProps) {
  const { resolvedTheme } = useTheme();
  const locale = useLocale();
  const t = useTranslations("explorer");
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const [initialView] = useState(() => {
    const wide = typeof window !== "undefined" && window.innerWidth >= 768;
    return {
      bounds: TURKEY_VIEW_BOUNDS,
      fitBoundsOptions: { padding: wide ? { top: 140, bottom: 40, left: 400, right: 60 } : { top: 150, bottom: 120, left: 16, right: 16 } },
    };
  });

  const setMapRef = useCallback(
    (instance: MapRef | null) => {
      mapRef.current = instance;
      if (instance) prepareMap(instance.getMap(), locale);
    },
    [locale, mapRef],
  );
  const [styleReady, setStyleReady] = useState(false);
  const [clusterList, setClusterList] = useState<{ longitude: number; latitude: number; ids: string[] } | null>(null);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const data = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: items.map((item) => {
        const category = categories[item.categoryKey];
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [item.longitude, item.latitude] },
          properties: {
            id: item.id,
            color: category?.color ?? DEFAULT_COLOR,
            icon: `${ICON_PREFIX}${category?.icon ?? "newspaper-sharp"}`,
            approx: isMorePrecise(item.precision, "district") ? 0 : 1,
          },
        };
      }),
    }),
    [items, categories],
  );

  const selected = selectedId ? byId.get(selectedId) : undefined;
  const area = useMemo(() => {
    if (!selected || isMorePrecise(selected.precision, "neighborhood")) return null;
    return circlePolygon(selected.longitude, selected.latitude, uncertaintyRadiusMeters(selected.precision));
  }, [selected]);

  const brand = theme === "dark" ? "#8fb4ff" : "#022859";
  const clusterText = theme === "dark" ? "#0b1324" : "#ffffff";
  const stroke = theme === "dark" ? "#0f1729" : "#ffffff";

  const layers = useMemo(() => {
    const clusters: LayerProps = {
      id: "clusters",
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": brand,
        "circle-opacity": 0.92,
        "circle-radius": ["step", ["get", "point_count"], 15, 10, 19, 50, 24, 200, 30],
        "circle-stroke-width": 4,
        "circle-stroke-color": brand,
        "circle-stroke-opacity": 0.25,
      },
    };
    const clusterCount: LayerProps = {
      id: "cluster-count",
      type: "symbol",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 12,
        "text-allow-overlap": true,
      },
      paint: { "text-color": clusterText },
    };
    const points: LayerProps = {
      id: "points",
      type: "circle",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 9, 12, 13],
        "circle-opacity": ["case", ["==", ["get", "approx"], 1], 0.72, 1],
        "circle-stroke-width": ["case", ["==", ["get", "approx"], 1], 3, 2],
        "circle-stroke-color": stroke,
        "circle-stroke-opacity": ["case", ["==", ["get", "approx"], 1], 0.6, 1],
      },
    };
    const icons: LayerProps = {
      id: "point-icons",
      type: "symbol",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.7, 12, 1],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    };
    return { clusters, clusterCount, points, icons };
  }, [brand, clusterText, stroke]);

  const ringLayer = useCallback(
    (id: string, targetId: string | null, width: number): LayerProps => ({
      id,
      type: "circle",
      source: SOURCE_ID,
      filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], targetId ?? ""]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 14, 12, 19],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-width": width,
        "circle-stroke-color": ["get", "color"],
      },
    }),
    [],
  );

  const handleLoad = useCallback(() => {
    setStyleReady(true);
    if (mapRef.current) onBoundsChange?.(readBounds(mapRef.current));
  }, [mapRef, onBoundsChange]);

  const handleClick = useCallback(
    async (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      setClusterList(null);
      if (!feature) {
        onSelect(null);
        return;
      }
      const map = mapRef.current;
      if (!map) return;
      if (feature.layer.id === "clusters") {
        const clusterId = Number(feature.properties?.cluster_id);
        const pointCount = Number(feature.properties?.point_count ?? 0);
        const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        if (!source || feature.geometry.type !== "Point") return;
        const [longitude, latitude] = feature.geometry.coordinates as [number, number];
        const zoom = await source.getClusterExpansionZoom(clusterId);
        if (zoom <= CLUSTER_MAX_ZOOM && zoom > map.getZoom() + 0.5) {
          map.easeTo({ center: [longitude, latitude], zoom, duration: 500 });
          return;
        }
        // Stories at the same coordinates never split: list them instead.
        const leaves = await source.getClusterLeaves(clusterId, Math.min(pointCount, 50), 0);
        setClusterList({
          longitude,
          latitude,
          ids: leaves.map((leaf) => String(leaf.properties?.id)).filter(Boolean),
        });
        return;
      }
      onSelect(String(feature.properties?.id));
    },
    [mapRef, onSelect],
  );

  const handleMouseMove = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const id = feature && feature.layer.id === "points" ? String(feature.properties?.id) : null;
      if (id !== hoveredId) onHover(id);
    },
    [hoveredId, onHover],
  );

  const clusterItems = useMemo(
    () => (clusterList ? clusterList.ids.map((id) => byId.get(id)).filter((item): item is MapNewsItem => Boolean(item)) : []),
    [clusterList, byId],
  );

  return (
    <>
      <MapGL
        ref={setMapRef}
        mapLib={maplibre}
        initialViewState={initialView}
        mapStyle={basemapStyle(theme, basemap)}
        maxBounds={MAP_MAX_BOUNDS}
        minZoom={MAP_MIN_ZOOM}
        maxZoom={18}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        attributionControl={false}
        interactiveLayerIds={["clusters", "points"]}
        cursor={hoveredId ? "pointer" : undefined}
        onLoad={handleLoad}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => onHover(null)}
        onMoveEnd={() => mapRef.current && onBoundsChange?.(readBounds(mapRef.current))}
        style={{ position: "absolute", inset: 0 }}
      >
        <AttributionControl compact position="bottom-right" />
        <NavigationControl position="bottom-right" showCompass={false} />
        <GeolocateControl position="bottom-right" trackUserLocation={false} showAccuracyCircle={false} />

        {area ? (
          <Source id="selected-area" type="geojson" data={area}>
            <Layer
              id="selected-area-fill"
              type="fill"
              paint={{ "fill-color": categories[selected!.categoryKey]?.color ?? DEFAULT_COLOR, "fill-opacity": 0.1 }}
            />
            <Layer
              id="selected-area-line"
              type="line"
              paint={{
                "line-color": categories[selected!.categoryKey]?.color ?? DEFAULT_COLOR,
                "line-width": 1.5,
                "line-dasharray": [2, 2],
              }}
            />
          </Source>
        ) : null}

        {styleReady ? (
          <Source id={SOURCE_ID} type="geojson" data={data} cluster clusterMaxZoom={CLUSTER_MAX_ZOOM} clusterRadius={46}>
            <Layer {...layers.clusters} />
            <Layer {...layers.clusterCount} />
            <Layer {...ringLayer("hover-ring", hoveredId, 2)} />
            <Layer {...layers.points} />
            <Layer {...layers.icons} />
            <Layer {...ringLayer("selected-ring", selectedId, 3)} />
          </Source>
        ) : null}

        {selected && renderPopup ? (
          <Popup
            longitude={selected.longitude}
            latitude={selected.latitude}
            anchor="bottom"
            offset={20}
            closeButton={false}
            closeOnClick={false}
            maxWidth="340px"
            onClose={() => onSelect(null)}
            className="hidden md:block"
          >
            {renderPopup(selected)}
          </Popup>
        ) : null}

        {clusterList && clusterItems.length > 0 && renderClusterList ? (
          <Popup
            longitude={clusterList.longitude}
            latitude={clusterList.latitude}
            anchor="bottom"
            offset={24}
            closeButton={false}
            maxWidth="320px"
            onClose={() => setClusterList(null)}
          >
            {renderClusterList(clusterItems)}
          </Popup>
        ) : null}

        {children}
      </MapGL>
      {!styleReady ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status">
          <span className="flex items-center gap-2 rounded-full border bg-background/85 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <Loader2 className="size-3.5 animate-spin" />
            {t("loadingMap")}
          </span>
        </div>
      ) : null}
    </>
  );
}
