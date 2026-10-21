"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useCallback, useRef, useState } from "react";
import MapGL, { type MapLayerMouseEvent, type MapRef, Marker, NavigationControl } from "react-map-gl/maplibre";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LocationPrecision } from "@/lib/domain/constants";
import { formatLocationLabel, isInTurkey, zoomForPrecision } from "@/lib/domain/location";
import type { GeocodeCandidate } from "@/lib/geo/nominatim";
import type { LocationInput } from "@/lib/news/schemas";
import { cn } from "@/lib/utils";

import maplibre from "./maplibre";
import { prepareMap } from "./setup";
import { basemapStyle, INITIAL_VIEW, MAP_MAX_BOUNDS } from "./styles";

export type LocationValue = LocationInput;

const PICKABLE_PRECISIONS: LocationPrecision[] = ["exact", "street", "neighborhood", "district", "city"];

async function geocode(params: Record<string, string>): Promise<GeocodeCandidate[]> {
  const response = await fetch(`/api/geocode?${new URLSearchParams(params)}`);
  if (response.status === 429) throw new Error("rate_limited");
  if (!response.ok) throw new Error("unavailable");
  const body = (await response.json()) as { results: GeocodeCandidate[] };
  return body.results;
}

function fromCandidate(candidate: GeocodeCandidate, point?: { latitude: number; longitude: number }, precision?: LocationPrecision): LocationValue {
  const resolved = precision ?? candidate.precision;
  return {
    latitude: point?.latitude ?? candidate.latitude,
    longitude: point?.longitude ?? candidate.longitude,
    precision: PICKABLE_PRECISIONS.includes(resolved) ? resolved : "city",
    province: candidate.province,
    district: candidate.district,
    neighborhood: candidate.neighborhood,
    street: candidate.street,
    label: formatLocationLabel({
      neighborhood: candidate.neighborhood,
      district: candidate.district,
      province: candidate.province,
      fallback: candidate.displayName,
    }),
  };
}

export function LocationPicker({
  value,
  onChange,
  invalid,
  className,
}: {
  value: Partial<LocationValue> | undefined;
  onChange: (value: LocationValue) => void;
  invalid?: boolean;
  className?: string;
}) {
  const t = useTranslations("locationPicker");
  const tp = useTranslations("precision");
  const { resolvedTheme } = useTheme();
  const locale = useLocale();
  const mapRef = useRef<MapRef | null>(null);
  const setMapRef = useCallback(
    (instance: MapRef | null) => {
      mapRef.current = instance;
      if (instance) prepareMap(instance.getMap(), locale);
    },
    [locale],
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeCandidate[] | null>(null);
  const [busy, setBusy] = useState<"search" | "reverse" | "locate" | null>(null);

  const hasPoint = value?.latitude != null && value?.longitude != null;

  const flyTo = useCallback((latitude: number, longitude: number, precision: LocationPrecision) => {
    mapRef.current?.flyTo({ center: [longitude, latitude], zoom: zoomForPrecision(precision) + 1, duration: 700 });
  }, []);

  const reverse = useCallback(
    async (latitude: number, longitude: number) => {
      if (!isInTurkey(latitude, longitude)) {
        toast.error(t("outsideTurkey"));
        return;
      }
      setBusy("reverse");
      try {
        const [candidate] = await geocode({ lat: String(latitude), lng: String(longitude) });
        const precision: LocationPrecision = candidate?.street ? "street" : candidate?.neighborhood ? "neighborhood" : "district";
        if (candidate) onChange(fromCandidate(candidate, { latitude, longitude }, precision));
        else
          onChange({
            latitude,
            longitude,
            precision: "neighborhood",
            label: value?.label || t("pickedPoint"),
            province: null,
            district: null,
            neighborhood: null,
            street: null,
          });
      } catch (error) {
        toast.error((error as Error).message === "rate_limited" ? t("rateLimited") : t("lookupFailed"));
        onChange({
          latitude,
          longitude,
          precision: value?.precision ?? "neighborhood",
          label: value?.label || t("pickedPoint"),
          province: value?.province ?? null,
          district: value?.district ?? null,
          neighborhood: value?.neighborhood ?? null,
          street: value?.street ?? null,
        });
      } finally {
        setBusy(null);
      }
    },
    [onChange, t, value],
  );

  async function search() {
    if (query.trim().length < 2) return;
    setBusy("search");
    try {
      setResults(await geocode({ q: query.trim() }));
    } catch (error) {
      toast.error((error as Error).message === "rate_limited" ? t("rateLimited") : t("lookupFailed"));
    } finally {
      setBusy(null);
    }
  }

  function choose(candidate: GeocodeCandidate) {
    const next = fromCandidate(candidate);
    onChange(next);
    setResults(null);
    setQuery("");
    flyTo(next.latitude, next.longitude, next.precision);
  }

  function locate() {
    if (!navigator.geolocation) {
      toast.error(t("noGeolocation"));
      return;
    }
    setBusy("locate");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        flyTo(latitude, longitude, "street");
        void reverse(latitude, longitude);
      },
      () => {
        setBusy(null);
        toast.error(t("geolocationDenied"));
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function handleMapClick(event: MapLayerMouseEvent) {
    void reverse(event.lngLat.lat, event.lngLat.lng);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
        />
        <Button type="button" variant="outline" onClick={() => void search()} disabled={busy !== null}>
          {busy === "search" ? <Loader2 className="animate-spin" /> : <Search />}
          <span className="hidden sm:inline">{t("search")}</span>
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={locate} disabled={busy !== null} aria-label={t("useMyLocation")}>
          {busy === "locate" ? <Loader2 className="animate-spin" /> : <Crosshair />}
        </Button>
        {results ? (
          <div className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-xl border bg-popover shadow-lg">
            {results.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-muted-foreground">{t("noResults")}</p>
            ) : (
              <ul className="max-h-60 overflow-y-auto p-1">
                {results.map((candidate) => (
                  <li key={`${candidate.latitude},${candidate.longitude}`}>
                    <button
                      type="button"
                      onClick={() => choose(candidate)}
                      className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent"
                    >
                      <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="flex flex-col">
                        <span className="line-clamp-2">{candidate.displayName}</span>
                        <span className="text-xs text-muted-foreground">{tp(`long.${candidate.precision}`)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "relative h-56 overflow-hidden rounded-xl border sm:h-64",
          invalid ? "border-destructive ring-3 ring-destructive/20" : "border-border",
        )}
      >
        <MapGL
          ref={setMapRef}
          mapLib={maplibre}
          initialViewState={
            hasPoint
              ? { longitude: value!.longitude!, latitude: value!.latitude!, zoom: zoomForPrecision(value?.precision ?? "district") + 1 }
              : INITIAL_VIEW
          }
          mapStyle={basemapStyle(resolvedTheme === "dark" ? "dark" : "light", "detailed")}
          maxBounds={MAP_MAX_BOUNDS}
          dragRotate={false}
          touchPitch={false}
          attributionControl={{ compact: true }}
          onClick={handleMapClick}
          cursor="crosshair"
          style={{ position: "absolute", inset: 0 }}
        >
          <NavigationControl position="top-right" showCompass={false} />
          {hasPoint ? (
            <Marker
              longitude={value!.longitude!}
              latitude={value!.latitude!}
              anchor="bottom"
              draggable
              onDragEnd={(event) => void reverse(event.lngLat.lat, event.lngLat.lng)}
            >
              <MapPin className="size-9 fill-primary text-primary-foreground drop-shadow-md" strokeWidth={1.5} />
            </Marker>
          ) : null}
        </MapGL>
        {!hasPoint ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <span className="rounded-full bg-background/90 px-3 py-1 text-xs shadow">{t("hint")}</span>
          </div>
        ) : null}
        {busy === "reverse" ? (
          <div className="absolute top-2 left-2 rounded-full bg-background/90 p-1.5 shadow">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : null}
      </div>

      {hasPoint ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            value={value?.label ?? ""}
            onChange={(event) => onChange({ ...(value as LocationValue), label: event.target.value })}
            aria-label={t("label")}
            placeholder={t("label")}
          />
          <Select
            value={value?.precision ?? "neighborhood"}
            onValueChange={(precision) => onChange({ ...(value as LocationValue), precision: precision as LocationPrecision })}
          >
            <SelectTrigger className="sm:w-48" aria-label={t("precision")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PICKABLE_PRECISIONS.map((precision) => (
                <SelectItem key={precision} value={precision}>
                  {tp(`long.${precision}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
