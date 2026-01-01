import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Compat route:
 * Some Supabase email templates redirect to /auth/confirm?token_hash=...&type=signup
 * We simply forward everything to /auth/callback (which handles both flows).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const qs = url.searchParams.toString();
  const dest = qs ? ("/auth/callback?" + qs) : "/auth/callback";

  return NextResponse.redirect(origin + dest);
}