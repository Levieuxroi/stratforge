import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !anon) throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");

  const cookieStore = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // ignore in environments where cookies are read-only
        }
      },
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const next = url.searchParams.get("next") || "/dashboard";
  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type"); // signup | recovery | invite | email_change

  try {
    const supabase = await supabaseServer();

    // 1) PKCE flow (most common): ?code=...
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(origin + next);
      return NextResponse.redirect(origin + "/login?error=confirm_code");
    }

    // 2) token_hash flow (sometimes used in templates): ?token_hash=...&type=signup
    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({ type: type as any, token_hash });
      if (!error) return NextResponse.redirect(origin + next);
      return NextResponse.redirect(origin + "/login?error=confirm_token");
    }

    return NextResponse.redirect(origin + "/login?error=confirm_missing_params");
  } catch {
    return NextResponse.redirect(origin + "/login?error=confirm_exception");
  }
}