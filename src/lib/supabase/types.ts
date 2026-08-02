import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Any Supabase client scoped to Vantage's schema — satisfied by the
// cookie-session server client (`@/lib/supabase/server`) and by the
// service-role admin client (`@/lib/supabase/admin`) alike, so the ingestion,
// analysis, and discovery pipelines can run under either.
export type VantageClient = SupabaseClient<Database, "vantage">;
