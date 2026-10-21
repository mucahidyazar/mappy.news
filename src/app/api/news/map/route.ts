import { NextResponse } from "next/server";

import { mapQuerySchema } from "@/lib/news/filters";
import { listMapNews } from "@/server/news/public";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = mapQuerySchema.parse(params);
  try {
    const result = await listMapNews(query);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("[api/news/map]", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
