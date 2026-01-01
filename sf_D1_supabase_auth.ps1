Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function WriteUtf8NoBom([string]$path, [string]$content) {
  $dir = Split-Path $path -Parent
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

# Toujours se placer à la racine du projet (dossier du script)
Set-Location $PSScriptRoot

# Detect APPROOT
$APPROOT = $null
if (Test-Path ".\src\app") { $APPROOT = ".\src\app" }
elseif (Test-Path ".\app") { $APPROOT = ".\app" }
else { throw "ERREUR: ni .\src\app ni .\app trouvés dans $(Get-Location)" }

# Detect LIBROOT (src/lib si src/app, sinon ./lib)
$LIBROOT = $null
if ($APPROOT -eq ".\src\app") { $LIBROOT = ".\src\lib" } else { $LIBROOT = ".\lib" }

Write-Host "OK: APPROOT = $APPROOT" -ForegroundColor Green
Write-Host "OK: LIBROOT = $LIBROOT" -ForegroundColor Green

# 1) Install deps
Write-Host "Installing Supabase deps..." -ForegroundColor Cyan
npm i @supabase/ssr @supabase/supabase-js | Out-Null

# 2) lib/supabase/browser.ts
$browserTs = @'
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(url, key);
}
'@
WriteUtf8NoBom (Join-Path $LIBROOT "supabase\browser.ts") $browserTs

# 3) lib/supabase/server.ts
$serverTs = @'
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = cookies();

  return createServerClient(url, key, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set(name, value, options) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // ok: middleware gère les cookies côté edge
        }
      },
      remove(name, options) {
        try {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        } catch {
          // ignore
        }
      },
    },
  });
}
'@
WriteUtf8NoBom (Join-Path $LIBROOT "supabase\server.ts") $serverTs

# 4) middleware.ts (root): protège /dashboard + redirige /login si déjà connecté
$middlewareTs = @'
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
'@
WriteUtf8NoBom ".\middleware.ts" $middlewareTs

# 5) app/login/page.tsx : vraie auth (login/signup)
$loginPath = Join-Path $APPROOT "login\page.tsx"
$loginTsx = @'
"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";

  const supabase = useMemo(() => supabaseBrowser(), []);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        if (!data.session) {
          setMsg("Compte créé. Vérifie ton email si la confirmation est activée, puis reconnecte-toi.");
        } else {
          router.push(next);
          router.refresh();
        }
      }
    } catch (err: any) {
      setMsg(err?.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-bold">Connexion</h1>

        <div className="flex gap-2">
          <button
            className={"rounded-md px-3 py-2 text-sm border " + (mode === "login" ? "bg-black text-white" : "")}
            type="button"
            onClick={() => setMode("login")}
            disabled={loading}
          >
            Connexion
          </button>
          <button
            className={"rounded-md px-3 py-2 text-sm border " + (mode === "signup" ? "bg-black text-white" : "")}
            type="button"
            onClick={() => setMode("signup")}
            disabled={loading}
          >
            Inscription
          </button>
        </div>

        <form className="rounded-md border p-4 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="block text-sm">Email</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="giuseppe_aloi@hotmail.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm">Mot de passe</label>
            <input
              type="password"
              className="w-full rounded-md border px-3 py-2"
              placeholder="••••••••"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {msg ? <div className="text-sm text-red-600">{msg}</div> : null}

          <button className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-50" disabled={loading}>
            {loading ? "..." : mode === "login" ? "Se connecter" : "Créer le compte"}
          </button>
        </form>

        <a className="text-sm underline" href="/">
          ← Retour
        </a>
      </div>
    </main>
  );
}
'@
WriteUtf8NoBom $loginPath $loginTsx

Write-Host "OK: files written (supabase clients + middleware + login wired)" -ForegroundColor Green

git add . | Out-Null
$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "OK: rien à commit (aucun changement détecté)" -ForegroundColor Yellow
  exit 0
}

git commit -m "feat: supabase auth + middleware protect dashboard" | Out-Null
git push | Out-Null
Write-Host "OK: pushed" -ForegroundColor Green
