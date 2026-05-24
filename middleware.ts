import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/calls/:path*",
    "/chat/:path*",
    "/dashboard/:path*",
    "/discover/:path*",
    "/liked-you/:path*",
    "/login",
    "/matches/:path*",
    "/messages/:path*",
    "/moments/:path*",
    "/notifications/:path*",
    "/onboarding/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/signup",
    "/wallet/:path*",
  ],
};
