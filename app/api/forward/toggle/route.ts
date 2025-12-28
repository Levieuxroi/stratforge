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
    const body = await req.json().catch(() => ({} as any));

    const enable = !!(body as any).enable;
    const schedule = typeof (body as any).schedule === "string" ? (body as any).schedule.trim() : "";

    // Paywall: check plan in profiles
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

    const payload: any = {
      user_id: user.id,
      enabled: enable,
      updated_at: new Date().toISOString()
    };

    if (schedule.length > 0) payload.schedule = schedule;

    const { error: fErr } = await supabaseAdmin
      .from("forward_configs")
      .upsert(payload, { onConflict: "user_id" });

    if (fErr) return Response.json({ error: fErr.message }, { status: 500 });

    return Response.json({ ok: true, enabled: enable, schedule, plan });
  } catch (e: any) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
