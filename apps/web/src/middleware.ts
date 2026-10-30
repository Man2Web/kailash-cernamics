import { NextResponse, type NextRequest } from "next/server";

/** Send signed-out visitors to /login. The API still checks the real session on every call. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has("gc_session") || req.cookies.has("gc_rt");
  // An attendance scan link (/attendance?token=...) works without signing in: the rotating QR token is the credential.
  const isScanLink = pathname === "/attendance" && req.nextUrl.searchParams.has("token");
  if (!hasSession && !isScanLink && !pathname.startsWith("/login")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/|health|favicon|icon|manifest|sw.js|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
