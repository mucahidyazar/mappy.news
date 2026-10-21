"use client";

import * as maplibregl from "maplibre-gl";

/**
 * MapLibre resolves its worker relative to its own module URL, which the bundler cannot follow.
 * scripts/copy-vendor.mjs copies the worker into /public/vendor; pass this module as `mapLib`.
 */
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl(`/vendor/maplibre-gl-worker.mjs?v=${maplibregl.getVersion()}`);
}

export default maplibregl;
