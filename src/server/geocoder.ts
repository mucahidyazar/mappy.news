import "server-only";

import { db } from "@/lib/db";
import { appUrl, serverEnv } from "@/lib/env";
import { createGeocoder, createNominatimClient, type Geocoder } from "@/lib/geo/geocoder";

const globalForGeocoder = globalThis as unknown as { __mappyGeocoder?: Geocoder };

export function getWebGeocoder(): Geocoder {
  if (!globalForGeocoder.__mappyGeocoder) {
    const env = serverEnv();
    globalForGeocoder.__mappyGeocoder = createGeocoder(
      db,
      createNominatimClient({ NOMINATIM_URL: env.NOMINATIM_URL, GEOCODER_CONTACT_EMAIL: env.GEOCODER_CONTACT_EMAIL, APP_URL: appUrl() }),
    );
  }
  return globalForGeocoder.__mappyGeocoder;
}
