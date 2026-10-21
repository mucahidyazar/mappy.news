import { NextResponse } from "next/server";

import { getCategories } from "@/server/categories";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getCategories(), {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error("[api/categories]", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
