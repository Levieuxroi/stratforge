import { Suspense } from "react";
import ForwardClient from "./ForwardClient";

export const dynamic = "force-dynamic";

export default function ForwardPage() {
  return (
    <Suspense fallback={<main className="min-h-screen p-8">Loading…</main>}>
      <ForwardClient />
    </Suspense>
  );
}
