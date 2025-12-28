import { Suspense } from "react";
import SignalsClient from "./SignalsClient";

export const dynamic = "force-dynamic";

export default function SignalsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen p-8">Loading…</main>}>
      <SignalsClient />
    </Suspense>
  );
}
