"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Compte créé. Tu peux te connecter maintenant (ou vérifie ton email si Supabase demande une confirmation).");
        setMode("signin");
      }
    } catch (err: any) {
      setMsg(err?.message ?? "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-bold">{mode === "signin" ? "Connexion" : "Créer un compte"}</h1>

        <div className="flex gap-2">
          <button
            className={
              "rounded-md px-3 py-2 text-sm border " + (mode === "signin" ? "bg-black text-white" : "")
            }
            onClick={() => setMode("signin")}
            type="button"
          >
            Connexion
          </button>
          <button
            className={
              "rounded-md px-3 py-2 text-sm border " + (mode === "signup" ? "bg-black text-white" : "")
            }
            onClick={() => setMode("signup")}
            type="button"
          >
            Inscription
          </button>
        </div>

        <form className="rounded-md border p-4 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="block text-sm">Email</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="giuseppe_aloi@hotmail.com"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm">Mot de passe</label>
            <input
              type="password"
              className="w-full rounded-md border px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <button disabled={busy} className="w-full rounded-md bg-black px-4 py-2 text-white">
            {busy ? "..." : mode === "signin" ? "Se connecter" : "Créer le compte"}
          </button>

          {msg && <div className="text-sm text-gray-700">{msg}</div>}
        </form>

        <a className="text-sm underline" href="/">
          ← Retour
        </a>
      </div>
    </main>
  );
}
