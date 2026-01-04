export const runtime = "nodejs";

function has(name: string) {
  const v = process.env[name];
  return !!(v && String(v).trim().length > 0);
}

export async function GET() {
  const ok =
    has("NEXT_PUBLIC_SUPABASE_URL") &&
    has("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
    has("NEXT_PUBLIC_APP_URL");

  return Response.json({
    ok,
    time: new Date().toISOString(),
    env: {
      NEXT_PUBLIC_SUPABASE_URL: has("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: has("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      NEXT_PUBLIC_APP_URL: has("NEXT_PUBLIC_APP_URL"),
      STRIPE_SECRET_KEY: has("STRIPE_SECRET_KEY"),
      STRIPE_WEBHOOK_SECRET: has("STRIPE_WEBHOOK_SECRET"),
      SUPABASE_SERVICE_ROLE_KEY: has("SUPABASE_SERVICE_ROLE_KEY"),
    },
  });
}