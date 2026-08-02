import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/cron-auth";
import { runDiscoveryForUser } from "@/lib/ai/discoveryRun";

// Scheduled discovery sweep — one users-with-active-topics pass per call.
// Each user costs a few web-search-enabled model calls, so run this
// infrequently (e.g. daily), not on the same cadence as ingestion.
export async function POST(request: NextRequest) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const db = createAdminClient();
  if (!db) {
    return NextResponse.json(
      { error: "Scheduled discovery needs SUPABASE_SERVICE_ROLE_KEY. The in-app 'Run discovery' button works without it." },
      { status: 503 }
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Discovery needs ANTHROPIC_API_KEY." }, { status: 503 });
  }

  const { data: users } = await db.from("topics").select("user_id").eq("status", "active");
  const uniqueUserIds = [...new Set((users ?? []).map((u) => u.user_id))];

  let totalSuggestions = 0;
  for (const userId of uniqueUserIds) {
    try {
      const result = await runDiscoveryForUser(db, userId);
      totalSuggestions += result.suggestionsFound;
    } catch {
      // continue to the next user — one failure shouldn't block the sweep
    }
  }

  return NextResponse.json({ usersProcessed: uniqueUserIds.length, totalSuggestions });
}
