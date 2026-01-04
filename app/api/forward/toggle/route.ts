export const runtime = "nodejs";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { requireMinPlan } from "../../../../lib/guards";

export async function POST(req: Request) {
  
  const gate = await requireMinPlan(req, "pro");
  if (gate instanceof Response) return gate;
try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return Response.json({ error: "Missing auth token" }, { status: 401 });

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userRes?.user) return Response.json({ error: "Invalid session" }, { status: 401 });

    const user = userRes.user;
    const body = await req.json();

    const enable = !!body.enable;
    const schedule = typeof body.schedule === "string" ? body.schedule.trim() : "";
    const intervalMinutesRaw = body.interval_minutes;
    const interval_minutes = Number.isFinite(Number(intervalMinutesRaw)) ? Number(intervalMinutesRaw) : 5;

    const strategy_id = typeof body.strategy_id === "string" && body.strategy_id.length > 0
      ? body.strategy_id
      : null;

    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

    const plan = String((prof as any)?.plan || "free");
    const allowed = plan === "pro" || plan === "elite";

    if (!allowed) {
      return Response.json({ error: "Upgrade required (Pro/Elite)." }, { status: 403 });
    }

    if (interval_minutes < 1 || interval_minutes > 1440) {
      return Response.json({ error: "interval_minutes invalid (1..1440)" }, { status: 400 });
    }

    const payload: any = {
      user_id: user.id,
      enabled: enable,
      schedule: schedule,
      interval_minutes,
      strategy_id,
      updated_at: new Date().toISOString()
    };

    const { error: fErr } = await supabaseAdmin
      .from("forward_configs")
      .upsert(payload, { onConflict: "user_id" });

    if (fErr) return Response.json({ error: fErr.message }, { status: 500 });

    return Response.json({ ok: true, enabled: enable, schedule, interval_minutes, strategy_id, plan });
  } catch (e: any) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
