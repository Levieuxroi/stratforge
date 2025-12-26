import { Suspense } from "react";
import ExportClient from "./ExportClient";

export const dynamic = "force-dynamic";

export default function ExportPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-8">
          <div className="mx-auto max-w-4xl text-sm text-gray-600">Chargement...</div>
        </main>
      }
    >
      <ExportClient />
    </Suspense>
  );
}
