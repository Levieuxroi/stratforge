import { Suspense } from "react";
import BuilderClient from "./BuilderClient";

export const dynamic = "force-dynamic";

export default function BuilderPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-8">
          <div className="mx-auto max-w-3xl text-sm text-gray-600">Chargement...</div>
        </main>
      }
    >
      <BuilderClient />
    </Suspense>
  );
}
