export const runtime = "nodejs";

import { GET as runForward } from "../forward/run/route";

export async function GET(req: Request) {
  // Vercel ajoute ce header sur les Cron Jobs
  const isCron = req.headers.get("x-vercel-cron");

  // sécurité simple: on refuse les appels "normaux"
  if (!isCron) {
    return Response.json({ error: "Unauthorized (not a Vercel cron)" }, { status: 401 });
  }

  const secret = process.env.CRON_SECRET || "";
  const url = new URL(req.url);
  url.pathname = "/api/forward/run";
  url.search = secret ? `?secret=${encodeURIComponent(secret)}` : "";

  const internalReq = new Request(url.toString(), { method: "GET" });
  return runForward(internalReq);
}
