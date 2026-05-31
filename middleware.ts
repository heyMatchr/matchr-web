import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/calls/:path*",
    "/admin/:path*",
    "/chat/:path*",
    "/discover/:path*",
    "/matches/:path*",
    "/messages/:path*",
    "/moments/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/wallet/:path*",
  ],
};
