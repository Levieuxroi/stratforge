import { createBrowserClient } from "@supabase/ssr";

// Instance unique côté navigateur, session en COOKIES (pas localStorage)
export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
