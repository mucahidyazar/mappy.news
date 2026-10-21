import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getWebGeocoder } from "@/server/geocoder";

export const dynamic = "force-dynamic";

const querySchema = z.union([
  z.object({ q: z.string().trim().min(2).max(200) }),
  z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }),
]);

/**
 * Place search and reverse lookup for the location pickers. Signed-in users only, because every miss costs a
 * request to the public Nominatim service.
 */
export async function GET(request: Request) {
  const session = await getAuth()
    .api.getSession({ headers: request.headers })
    .catch(() => null);
  if (!session?.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const limited = rateLimit(`geocode:${session.user.id}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } },
    );
  }

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  try {
    const geocoder = getWebGeocoder();
    if ("q" in parsed.data) {
      return NextResponse.json({ results: await geocoder.search(parsed.data.q, { limit: 6, signal: request.signal }) });
    }
    const result = await geocoder.reverse(parsed.data.lat, parsed.data.lng, { signal: request.signal });
    return NextResponse.json({ results: result ? [result] : [] });
  } catch (error) {
    console.warn("[api/geocode]", (error as Error).message);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
