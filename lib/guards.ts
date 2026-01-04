import { supabaseAdmin } from "./supabaseAdmin";

export type Plan = "free" | "pro" | "elite";

const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  pro: 1,
  elite: 2,
};

function safePlan(x: any): Plan {
  const p = String(x || "").toLowerCase();
  if (p === "pro" || p === "elite") return p;
  return "free";
}

export function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

/**
 * Anti-CSRF simple & robuste:
 * - Si Origin est présent, il doit matcher l'origin de la requête (ou NEXT_PUBLIC_APP_URL).
 * - Si Origin est absent (certains appels server-to-server), on laisse passer.
 */
export function enforceSameOrigin(req: Request): Response | null {
  const originHeader = req.headers.get("origin");
  if (!originHeader) return null;

  const reqOrigin = new URL(req.url).origin;
  const allowed = new Set([reqOrigin]);

  const appUrlRaw = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrlRaw) {
    try {
      allowed.add(new URL(appUrlRaw).origin);
    } catch {
      // Env invalide -> on ignore pour ne pas faire planter l'API
    }
  }

  if (!allowed.has(originHeader)) {
    return Response.json({ error: "forbidden_origin", origin: originHeader }, { status: 403 });
  }
  return null;
}

/**
 * Auth server-side (impossible à bypass).
 * => exige Authorization: Bearer <access_token>
 */
export async function requireAuth(req: Request): Promise<{ user: any; token: string } | Response> {
  const token = getBearerToken(req);
  if (!token) return Response.json({ error: "missing_auth_token" }, { status: 401 });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return Response.json({ error: "invalid_session" }, { status: 401 });

  return { user: data.user, token };
}

/**
 * Plan (free/pro/elite) lu dans profiles.
 */
export async function getUserPlan(userId: string): Promise<Plan> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  if (error) return "free";
  return safePlan((data as any)?.plan);
}

/**
 * Garde minimum de plan.
 * Exemple: requireMinPlan(req, "pro")
 */
export async function requireMinPlan(
  req: Request,
  minPlan: Plan
): Promise<{ user: any; token: string; plan: Plan } | Response> {
  const originCheck = enforceSameOrigin(req);
  if (originCheck) return originCheck;

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const plan = await getUserPlan(auth.user.id);

  if (PLAN_RANK[plan] < PLAN_RANK[minPlan]) {
    return Response.json(
      { error: "forbidden_plan", required: minPlan, current: plan },
      { status: 403 }
    );
  }

  return { ...auth, plan };
}
