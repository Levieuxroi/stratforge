import { supabaseBrowser } from "./supabase/browser";

// On garde le même export "supabase" pour ne rien casser ailleurs
export const supabase = supabaseBrowser;
