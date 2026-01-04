"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error("app/global-error.tsx", error);

  return (
    <html>
      <body>
        <main className="min-h-screen p-8">
          <h1 className="text-xl font-semibold">Erreur critique</h1>
          <p className="mt-2 text-sm opacity-80">
            {error?.message ? error.message : "Erreur inconnue"}
          </p>
          <div className="mt-4 flex gap-2">
            <button className="rounded-md bg-black text-white px-4 py-2 text-sm" onClick={() => reset()}>
              Reessayer
            </button>
            <button className="rounded-md border px-4 py-2 text-sm" onClick={() => (window.location.href = "/")}>
              Accueil
            </button>
          </div>
          {error?.digest ? <p className="mt-4 text-xs opacity-60">Digest: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}