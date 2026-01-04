export default function HomePage() {
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold">StratForge</h1>
        <p className="text-base text-gray-600">
          Builder no-code de stratégies crypto + backtests + export de code (TradingView / QuantConnect).
        </p>

        <div className="flex gap-3">
          <a href="/login" className="rounded-md bg-black px-4 py-2 text-white">
            Se connecter
          </a>
          <a href="/dashboard" className="rounded-md border px-4 py-2">
            Dashboard
          </a>
        </div>

        <div className="rounded-md border p-4 text-sm text-gray-600">
          <p><b>V1 (MVP)</b> : Strategy Builder + Backtest + Export PineScript/QuantConnect.</p>
          <p>On ajoute Supabase (auth + DB) juste après.</p>
        </div>
      </div>
    </main>
  );
}
