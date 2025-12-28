export const runtime = "nodejs";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { runForwardForUser } from "../../../../lib/forwardRunner";

export async function POST(req: Request) {
  try {
    const isCron = (req.headers.get("x-vercel-cron") === "1");

    // Allow:
    // - Cron: body must contain user_id (and optional strategy_id)
    // - Non-cron: must provide Supabase bearer token, and runs for that user
    let user_id: string | null = null;
    let strategy_id: string | null = null;

    const body = await req.json().catch(() => ({} as any));
    strategy_id = typeof body.strategy_id === "string" ? body.strategy_id : null;

    if (isCron) {
      user_id = typeof body.user_id === "string" ? body.user_id : null;
      if (!user_id) return Response.json({ error: "Missing user_id" }, { status: 400 });
    } else {
      const auth = req.headers.get("authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token) return Response.json({ error: "Missing auth token" }, { status: 401 });

      const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (userErr || !userRes?.user) return Response.json({ error: "Invalid session" }, { status: 401 });

      user_id = userRes.user.id;

      // Paywall check
      const { data: prof, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("plan")
        .eq("id", user_id)
        .maybeSingle();

      if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

      const plan = String((prof as any)?.plan || "free");
      const allowed = plan === "pro" || plan === "elite";
      if (!allowed) return Response.json({ error: "Upgrade required (Pro/Elite)." }, { status: 403 });
    }

    const res = await runForwardForUser(user_id!, strategy_id);
    if (!res.ok) return Response.json(res, { status: 500 });
    return Response.json(res);
  } catch (e: any) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
