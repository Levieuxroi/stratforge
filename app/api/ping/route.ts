export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    now: new Date().toISOString(),
    vercel: {
      ref: process.env.VERCEL_GIT_COMMIT_REF || null,
      sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      env: process.env.VERCEL_ENV || null
    }
  });
}