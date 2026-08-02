import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Vantage's tables live in a dedicated `vantage` Postgres schema rather than
// `public`, so the app can share a Supabase project with other apps without
// colliding on table names (see docs/ARCHITECTURE.md → Deployment).
export function createClient() {
  return createBrowserClient<Database, "vantage">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "vantage" } }
  );
}
