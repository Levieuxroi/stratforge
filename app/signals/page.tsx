import { requireAuth, requirePlan } from "../../lib/pageGuard";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import SignalsClient from "./SignalsClient";
import { supabaseServer } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

function buildNext(pathname: string, searchParams?: PageProps["searchParams"]) {
  const qs = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string") qs.set(k, v);
      else if (Array.isArray(v) && v.length) qs.set(k, v[0] ?? "");
    }
  }
  const q = qs.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export default async function SignalsPage({ searchParams }: PageProps) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    const next = buildNext("/signals", searchParams);
    redirect("/login?next=" + encodeURIComponent(next));
  }

  return (
    <Suspense fallback={<main className="min-h-screen p-8">Loading…</main>}>
      <SignalsClient />
    </Suspense>
  );
}
