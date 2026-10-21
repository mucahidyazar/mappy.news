"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { useCallback, useMemo } from "react";
import MapGL, { Layer, type MapRef, Marker, NavigationControl, Source } from "react-map-gl/maplibre";

import { CategoryIcon } from "@/components/icons/category-icon";
import { circlePolygon } from "@/components/map/geo";
import maplibre from "@/components/map/maplibre";
import { prepareMap } from "@/components/map/setup";
import { basemapStyle } from "@/components/map/styles";
import type { LocationPrecision } from "@/lib/domain/constants";
import { isMorePrecise, uncertaintyRadiusMeters, zoomForPrecision } from "@/lib/domain/location";

export function MiniMap({
  latitude,
  longitude,
  precision,
  color,
  icon,
}: {
  latitude: number;
  longitude: number;
  precision: LocationPrecision;
  color: string;
  icon: string;
}) {
  const { resolvedTheme } = useTheme();
  const locale = useLocale();
  const approximate = !isMorePrecise(precision, "neighborhood");
  const area = useMemo(
    () => (approximate ? circlePolygon(longitude, latitude, uncertaintyRadiusMeters(precision)) : null),
    [approximate, latitude, longitude, precision],
  );
  const setRef = useCallback((instance: MapRef | null) => {
    if (instance) prepareMap(instance.getMap(), locale);
  }, [locale]);

  return (
    <div className="relative h-56 overflow-hidden rounded-xl border lg:h-64">
      <MapGL
        ref={setRef}
        mapLib={maplibre}
        initialViewState={{ longitude, latitude, zoom: Math.min(zoomForPrecision(precision), 14) - (approximate ? 0.5 : 0) }}
        mapStyle={basemapStyle(resolvedTheme === "dark" ? "dark" : "light", "detailed")}
        dragRotate={false}
        touchPitch={false}
        scrollZoom={false}
        attributionControl={{ compact: true }}
        style={{ position: "absolute", inset: 0 }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {area ? (
          <Source id="area" type="geojson" data={area}>
            <Layer id="area-fill" type="fill" paint={{ "fill-color": color, "fill-opacity": 0.12 }} />
            <Layer id="area-line" type="line" paint={{ "line-color": color, "line-width": 1.5, "line-dasharray": [2, 2] }} />
          </Source>
        ) : null}
        <Marker longitude={longitude} latitude={latitude} anchor="center">
          <span
            className="flex size-9 items-center justify-center rounded-full border-2 border-white text-white shadow-lg"
            style={{ backgroundColor: color }}
          >
            <CategoryIcon icon={icon} className="size-4" />
          </span>
        </Marker>
      </MapGL>
    </div>
  );
}
