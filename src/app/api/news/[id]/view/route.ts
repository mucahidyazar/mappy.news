import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { recordView } from "@/server/news/public";

export const dynamic = "force-dynamic";

/** Counts a view once per visitor and day. The address is hashed with the auth secret and never stored. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new NextResponse(null, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  if (!rateLimit(`view:${ip}`, 120, 60_000).ok) return new NextResponse(null, { status: 429 });
  const userAgent = request.headers.get("user-agent") ?? "";
  if (/bot|crawl|spider|preview|fetch/i.test(userAgent)) return new NextResponse(null, { status: 204 });
  const day = new Date().toISOString().slice(0, 10);
  const visitorHash = createHash("sha256")
    .update(`${serverEnv().BETTER_AUTH_SECRET}:${day}:${ip}:${userAgent}`)
    .digest("hex")
    .slice(0, 32);
  try {
    await recordView(id, visitorHash);
  } catch (error) {
    console.warn("[api/view]", (error as Error).message);
  }
  return new NextResponse(null, { status: 204 });
}
