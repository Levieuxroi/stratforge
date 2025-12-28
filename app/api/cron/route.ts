export const runtime = "nodejs";

import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { runForwardForUser } from "../../../lib/forwardRunner";

export async function GET(req: Request) {
  try {
    const isCron = (req.headers.get("x-vercel-cron") === "1");

    // In production Vercel cron sends x-vercel-cron: 1.
    // For manual tests, you can also send this header yourself.
    if (!isCron) {
      return Response.json({ error: "Forbidden (missing x-vercel-cron header)" }, { status: 403 });
    }

    // 1) Load enabled configs
    const { data: cfgs, error: cErr } = await supabaseAdmin
      .from("forward_configs")
      .select("user_id,enabled,interval_minutes,strategy_id,last_run_at")
      .eq("enabled", true)
      .limit(1000);

    if (cErr) return Response.json({ error: cErr.message }, { status: 500 });

    const list = (cfgs || []).filter((c: any) => !!c.user_id && !!c.strategy_id);
    if (list.length === 0) return Response.json({ ok: true, ran: 0, skipped: 0, results: [] });

    const userIds = Array.from(new Set(list.map((c: any) => c.user_id)));

    // 2) Paywall filter: only pro/elite
    const { data: profs, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id,plan")
      .in("id", userIds);

    if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

    const planById = new Map<string, string>();
    (profs || []).forEach((p: any) => planById.set(p.id, String(p.plan || "free")));

    const now = Date.now();
    const results: any[] = [];
    let ran = 0;
    let skipped = 0;

    for (const cfg of list as any[]) {
      const plan = planById.get(cfg.user_id) || "free";
      const allowed = (plan === "pro" || plan === "elite");
      if (!allowed) { skipped++; continue; }

      const intervalMinutes = Number(cfg.interval_minutes || 5);
      const lastRunAt = cfg.last_run_at ? Date.parse(cfg.last_run_at) : 0;

      if (lastRunAt && now - lastRunAt < intervalMinutes * 60_000) {
        skipped++;
        continue;
      }

      const r = await runForwardForUser(cfg.user_id, cfg.strategy_id);
      results.push({ user_id: cfg.user_id, ok: r.ok, side: (r as any).side || null, error: (r as any).error || null });

      if (r.ok) ran++;
      else skipped++;
    }

    return Response.json({ ok: true, ran, skipped, results });
  } catch (e: any) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
