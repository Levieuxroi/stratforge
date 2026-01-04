export const runtime = "nodejs";

import Stripe from "stripe";
import { stripe } from "../../../../lib/stripe";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function planFromPrice(priceId: string): "pro" | "elite" | "free" {
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_ELITE) return "elite";
  return "free";
}

// Idempotence: if Stripe retries, we do not process twice
async function recordEventOnce(event: Stripe.Event) {
  const payload = event as any;
  const { error } = await supabaseAdmin.from("stripe_events").insert({
    event_id: event.id,
    type: event.type,
    livemode: (payload?.livemode ?? null) as any,
    payload
  });

  if (!error) return { duplicate: false };

  const code = (error as any)?.code;
  if (code === "23505") return { duplicate: true }; // unique violation

  throw new Error("Supabase stripe_events insert error: " + error.message);
}

async function upsertSubscriptionAndPlan(sub: Stripe.Subscription, fallbackUserId?: string) {
  const stripeCustomerId = String((sub as any).customer);
  const stripeSubId = String((sub as any).id);
  const status = String((sub as any).status);

  const cancelAtPeriodEnd = !!(sub as any).cancel_at_period_end;

  const currentPeriodEndUnix = (sub as any).current_period_end as number | undefined;
  const currentPeriodEnd = currentPeriodEndUnix ? new Date(currentPeriodEndUnix * 1000).toISOString() : null;

  const priceId = String((sub as any).items?.data?.[0]?.price?.id || "");
  const plan = ((sub as any).metadata?.plan as string) || planFromPrice(priceId);

  let userId = String(((sub as any).metadata?.user_id as string) || "") || (fallbackUserId || "");

  if (!userId) {
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();

    if (pErr) throw new Error("Supabase profiles lookup error: " + pErr.message);
    userId = (prof as any)?.id || "";
  }

  if (!userId) {
    throw new Error("No userId found for subscription (metadata.user_id missing and no profile match)");
  }

  const { error: sErr } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubId,
        status,
        price_id: priceId,
        plan,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        updated_at: new Date().toISOString()
      },
      { onConflict: "stripe_subscription_id" }
    );

  if (sErr) throw new Error("Supabase subscriptions upsert error: " + sErr.message);

  const isActive = status === "active" || status === "trialing";
  const { error: uErr } = await supabaseAdmin
    .from("profiles")
    .update({ plan: isActive ? (plan as any) : "free", updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (uErr) throw new Error("Supabase profiles update error: " + uErr.message);
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return Response.json({ error: "Missing stripe signature or STRIPE_WEBHOOK_SECRET" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err: any) {
    return Response.json({ error: `Webhook signature failed: ${err?.message || err}` }, { status: 400 });
  }

  try {
    const rec = await recordEventOnce(event);
    if (rec.duplicate) {
      return Response.json({ received: true, duplicate: true });
    }

    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;
      await upsertSubscriptionAndPlan(sub);
      return Response.json({ received: true });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const subId = session.subscription ? String(session.subscription) : "";
      const fallbackUserId = session.client_reference_id ? String(session.client_reference_id) : undefined;

      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        await upsertSubscriptionAndPlan(sub, fallbackUserId);
      }

      return Response.json({ received: true });
    }

    return Response.json({ received: true });
  } catch (e: any) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}