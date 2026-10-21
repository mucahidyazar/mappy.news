import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/** Generated metadata images keep the locale segment in their URL ("/tr/news/x/opengraph-image-ab12"). */
const METADATA_IMAGE = /\/(?:opengraph-image|twitter-image|icon|apple-icon)(?:-\w+)?$/;

/** Pages that need a session. Checked optimistically here; pages and actions verify the session themselves. */
const PROTECTED = /^\/(?:en\/)?(?:admin|profile)(?:\/|$)/;

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // A NUL byte is never part of a real address and Postgres refuses it in text.
  if ((pathname + search).includes("%00")) return new NextResponse(null, { status: 404 });

  if (METADATA_IMAGE.test(pathname)) return NextResponse.next();

  if (PROTECTED.test(pathname) && !getSessionCookie(request, { cookiePrefix: "mappy" })) {
    const english = pathname === "/en" || pathname.startsWith("/en/");
    const url = request.nextUrl.clone();
    url.pathname = english ? "/en/sign-in" : "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return intl(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
