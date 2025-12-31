export const runtime = "nodejs";

export async function GET() {
  const b = (v: any) => !!v;
  return Response.json({
    ok: true,
    now: new Date().toISOString(),
    vars: {
      NEXT_PUBLIC_SUPABASE_URL: b(process.env.NEXT_PUBLIC_SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: b(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: b(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
      STRIPE_SECRET_KEY: b(process.env.STRIPE_SECRET_KEY),
      STRIPE_WEBHOOK_SECRET: b(process.env.STRIPE_WEBHOOK_SECRET),
      NEXT_PUBLIC_APP_URL: b(process.env.NEXT_PUBLIC_APP_URL)
    }
  });
}