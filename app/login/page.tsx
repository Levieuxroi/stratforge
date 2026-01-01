"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
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
          setMsg("Compte crÃƒÂ©ÃƒÂ©. VÃƒÂ©rifie ton email si la confirmation est activÃƒÂ©e, puis reconnecte-toi.");
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
              placeholder="Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {msg ? <div className="text-sm text-red-600">{msg}</div> : null}

          <button className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-50" disabled={loading}>
            {loading ? "..." : mode === "login" ? "Se connecter" : "CrÃƒÂ©er le compte"}
          </button>
        </form>

        <a className="text-sm underline" href="/">
          Ã¢â€ Â Retour
        </a>
      </div>
    </main>
  );
}