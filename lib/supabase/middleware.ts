import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { requiredSupabaseEnv } from "./env";
import type { Database } from "./types";

const PROTECTED_ROUTE_PREFIXES = [
  "/calls",
  "/chat",
  "/discover",
  "/matches",
  "/messages",
  "/moments",
  "/profile",
  "/settings",
  "/wallet",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  if (!isProtectedPath(request.nextUrl.pathname)) {
    return response;
  }

  const supabase = createServerClient<Database>(
    requiredSupabaseEnv("SUPABASE_URL"),
    requiredSupabaseEnv("SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (process.env.NODE_ENV === "development") {
      console.log("[Logout] middleware redirect", {
        from: request.nextUrl.pathname,
        to: "/login",
      });
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
