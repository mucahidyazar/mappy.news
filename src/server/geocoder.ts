import "server-only";

import { db } from "@/lib/db";
import { appUrl, serverEnv } from "@/lib/env";
import { createGeocoder, createGeocoderClients, databaseCache, type Geocoder } from "@/lib/geo/geocoder";

const globalForGeocoder = globalThis as unknown as { __mappyGeocoder?: Geocoder };

export function getWebGeocoder(): Geocoder {
  if (!globalForGeocoder.__mappyGeocoder) {
    const env = serverEnv();
    globalForGeocoder.__mappyGeocoder = createGeocoder(
      databaseCache(db),
      createGeocoderClients(
        {
          NOMINATIM_URL: env.NOMINATIM_URL,
          PHOTON_URL: env.PHOTON_URL || undefined,
          OVERPASS_URL: env.OVERPASS_URL || undefined,
          GEOCODER_CONTACT_EMAIL: env.GEOCODER_CONTACT_EMAIL,
          APP_URL: appUrl(),
        },
        { fast: env.GEOCODER_FAST },
      ),
    );
  }
  return globalForGeocoder.__mappyGeocoder;
}
