"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Plan = "free" | "pro" | "elite";

export default function DashboardHeader() {
  const [plan, setPlan] = useState<Plan>("free");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", session.user.id)
        .maybeSingle();

      setPlan((prof?.plan || "free") as Plan);
    })();
  }, []);

  const badge = plan === "elite" ? "ELITE" : plan === "pro" ? "PRO" : "FREE";

  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="text-sm text-gray-600">
        Plan:
        <span className="ml-2 rounded-full border px-2 py-1 text-xs font-bold">
          {badge}
        </span>
      </div>

      {plan === "free" && (
        <a href="/pricing" className="rounded-md border px-3 py-2 text-sm">
          Upgrade
        </a>
      )}
    </div>
  );
}