import { NextResponse } from "next/server";
import { z } from "zod";

import { listComments } from "@/server/news/comments";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const cursor = new URL(request.url).searchParams.get("cursor");
  try {
    return NextResponse.json(await listComments(id, cursor));
  } catch (error) {
    console.error("[api/comments]", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
