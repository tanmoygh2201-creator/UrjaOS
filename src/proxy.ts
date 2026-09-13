import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";
import { sanitizeRedirect } from "@/lib/auth/redirect";

/**
 * Next.js 16 "proxy" (formerly middleware).
 *
 * Runs on every matched request to:
 *  1. Refresh the Supabase auth session cookies.
 *  2. Protect app routes — unauthenticated users are redirected to /login
 *     with a safe `next` parameter (fail closed).
 *  3. Send already-authenticated users away from /login and /register.
 *
 * Note: Route Handlers under /api are NOT protected here — each API route
 * must verify authentication and ownership itself (defense in depth).
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/systems",
  "/analytics",
  "/forecasting",
  "/battery",
  "/copilot",
  "/reports",
  "/alerts",
  "/bills",
  "/settings",
  "/admin",
];

const AUTH_ROUTES = ["/login", "/register"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, user } = await updateSession(request);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", sanitizeRedirect(`${pathname}${search}`, pathname));
    return NextResponse.redirect(url);
  }

  if (user && AUTH_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets, images and API routes.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
