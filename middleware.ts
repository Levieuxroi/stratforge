import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: { headers: req.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(url, key, {
    cookies: {
      get(name) {
        return req.cookies.get(name)?.value;
      },
      set(name, value, options) {
        res.cookies.set({ name, value, ...options });
      },
      remove(name, options) {
        res.cookies.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isDashboard = path.startsWith("/dashboard");

  if (isDashboard && !user) {
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    to.searchParams.set("next", "/dashboard");
    return NextResponse.redirect(to);
  }

  if (path === "/login" && user) {
    const to = req.nextUrl.clone();
    to.pathname = "/dashboard";
    to.search = "";
    return NextResponse.redirect(to);
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};