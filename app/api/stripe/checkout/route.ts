export const runtime = "nodejs";

import { stripe } from "../../../../lib/stripe";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

type Body = { plan: "pro" | "elite" };

function getPriceId(plan: "pro" | "elite") {
  if (plan === "pro") return process.env.STRIPE_PRICE_PRO;
  return process.env.STRIPE_PRICE_ELITE;
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return Response.json({ error: "Missing auth token" }, { status: 401 });

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userRes?.user) return Response.json({ error: "Invalid session" }, { status: 401 });

    const user = userRes.user;
    const body = (await req.json()) as Body;

    if (body?.plan !== "pro" && body?.plan !== "elite") {
      return Response.json({ error: "Invalid plan" }, { status: 400 });
    }

    const priceId = getPriceId(body.plan);
    if (!priceId) return Response.json({ error: "Missing STRIPE_PRICE_* env var" }, { status: 500 });

    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id,email,stripe_customer_id,plan")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

    let customerId = prof?.stripe_customer_id || null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || prof?.email || undefined,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;

      await supabaseAdmin.from("profiles").upsert({
        id: user.id,
        email: user.email,
        stripe_customer_id: customerId,
        plan: prof?.plan || "free",
        updated_at: new Date().toISOString()
      });
    }

    const origin = new URL(req.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      subscription_data: { metadata: { user_id: user.id, plan: body.plan } },
      success_url: `${origin}/account?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancel`
    });

    return Response.json({ url: session.url });
  } catch (e: any) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
