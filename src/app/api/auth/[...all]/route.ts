import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

function handler(request: Request) {
  const { GET, POST } = toNextJsHandler(getAuth());
  return request.method === "GET" ? GET(request) : POST(request);
}

export { handler as GET, handler as POST };
