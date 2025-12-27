export const runtime = "nodejs";

import { stripe } from "../../../../lib/stripe";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import Stripe from "stripe";

function planFromPrice(priceId: string): "pro" | "elite" | "free" {
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_ELITE) return "elite";
  return "free";
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
    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;

      const stripeCustomerId = String((sub as any).customer);
      const stripeSubId = (sub as any).id as string;
      const status = (sub as any).status as string;

      const cancelAtPeriodEnd = !!(sub as any).cancel_at_period_end;

      const currentPeriodEndUnix = (sub as any).current_period_end as number | undefined;
      const currentPeriodEnd = currentPeriodEndUnix
        ? new Date(currentPeriodEndUnix * 1000).toISOString()
        : null;

      const priceId = ((sub as any).items?.data?.[0]?.price?.id || "") as string;
      const plan = planFromPrice(priceId);

      // user_id depuis metadata ou profiles
      let userId = (((sub as any).metadata?.user_id as string) || "");

      if (!userId) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", stripeCustomerId)
          .maybeSingle();
        userId = (prof as any)?.id || "";
      }

      if (userId) {
        await supabaseAdmin.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubId,
          status,
          price_id: priceId,
          plan,
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: cancelAtPeriodEnd,
          updated_at: new Date().toISOString()
        }, { onConflict: "stripe_subscription_id" });

        const isActive = status === "active" || status === "trialing";
        await supabaseAdmin.from("profiles").update({
          plan: isActive ? plan : "free",
          updated_at: new Date().toISOString()
        }).eq("id", userId);
      }
    }

    return Response.json({ received: true });
  } catch (e: any) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
