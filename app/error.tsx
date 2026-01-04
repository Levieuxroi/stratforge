"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("app/error.tsx", error);
  }, [error]);

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-xl font-semibold">Une erreur est survenue</h1>
      <p className="mt-2 text-sm opacity-80">
        {error?.message ? error.message : "Erreur inconnue"}
      </p>
      <div className="mt-4 flex gap-2">
        <button
          className="rounded-md bg-black text-white px-4 py-2 text-sm"
          onClick={() => reset()}
        >
          Reessayer
        </button>
        <button
          className="rounded-md border px-4 py-2 text-sm"
          onClick={() => (window.location.href = "/")}
        >
          Accueil
        </button>
      </div>
      {error?.digest ? (
        <p className="mt-4 text-xs opacity-60">Digest: {error.digest}</p>
      ) : null}
    </main>
  );
}