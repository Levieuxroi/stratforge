export const runtime = "nodejs";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return Response.json({ error: "Missing auth token" }, { status: 401 });

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userRes?.user) return Response.json({ error: "Invalid session" }, { status: 401 });

    const user = userRes.user;

    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

    const plan = String((prof as any)?.plan || "free");

    const { data: cfg, error: cErr } = await supabaseAdmin
      .from("forward_configs")
      .select("enabled,schedule,interval_minutes,strategy_id,last_run_at,last_error,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (cErr) return Response.json({ error: cErr.message }, { status: 500 });

    return Response.json({
      ok: true,
      plan,
      forward: {
        enabled: !!(cfg as any)?.enabled,
        schedule: (cfg as any)?.schedule || "",
        interval_minutes: Number((cfg as any)?.interval_minutes || 5),
        strategy_id: (cfg as any)?.strategy_id || null,
        last_run_at: (cfg as any)?.last_run_at || null,
        last_error: (cfg as any)?.last_error || null,
        updated_at: (cfg as any)?.updated_at || null
      }
    });
  } catch (e: any) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
