import { Suspense } from "react";
import BacktestClient from "./BacktestClient";

export const dynamic = "force-dynamic";

export default function BacktestPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-8">
          <div className="mx-auto max-w-4xl text-sm text-gray-600">Chargement...</div>
        </main>
      }
    >
      <BacktestClient />
    </Suspense>
  );
}
