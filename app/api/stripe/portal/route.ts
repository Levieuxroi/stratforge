export const runtime = "nodejs";

import { stripe } from "../../../../lib/stripe";
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
      .select("id,email,stripe_customer_id,plan")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

    let customerId = prof?.stripe_customer_id || null;

    // ?o. FIX: si pas de customer, on le cr?e (comme checkout)
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || prof?.email || undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;

      await supabaseAdmin.from("profiles").upsert({
        id: user.id,
        email: user.email,
        stripe_customer_id: customerId,
        plan: prof?.plan || "free",
        updated_at: new Date().toISOString(),
      });
    }

    const origin = new URL(req.url).origin;

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/account`,
    });

    return Response.json({ url: portal.url });
  } catch (e: any) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
