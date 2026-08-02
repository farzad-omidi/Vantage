import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Service-role client, used ONLY by the scheduled cron routes
// (src/app/api/cron/*), which sweep across every user and therefore cannot run
// under any single user's session. Bypasses RLS entirely — never import this
// from client code or from a route that serves an end-user's own request.
//
// Returns null when SUPABASE_SERVICE_ROLE_KEY isn't configured, so a deployment
// without it still runs: the user-facing app works in full (manual sync,
// analysis, and discovery all run on the signed-in user's session), and only
// the cron sweeps are unavailable.
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;

  return createSupabaseClient<Database, "vantage">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      db: { schema: "vantage" },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
