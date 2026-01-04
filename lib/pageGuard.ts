import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export type Plan = "free" | "pro" | "elite";

function rank(p: Plan) {
  if (p === "elite") return 2;
  if (p === "pro") return 1;
  return 0;
}

export async function requireAuth(nextPath?: string) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) {
    redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  }
  return data.user;
}

export async function requirePlan(minPlan: Plan, nextPath?: string) {
  const user = await requireAuth(nextPath);
  const supabase = await supabaseServer();
  const { data: prof, error } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    redirect(`/pricing?err=plan_lookup`);
  }

  const p = (prof?.plan || "free") as Plan;
  if (rank(p) < rank(minPlan)) {
    redirect(`/pricing?need=${minPlan}`);
  }

  return { user, plan: p };
}