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

  const admin = createAdminClient();
  const { data: users } = await admin.from("topics").select("user_id").eq("status", "active");
  const uniqueUserIds = [...new Set((users ?? []).map((u) => u.user_id))];

  let totalSuggestions = 0;
  for (const userId of uniqueUserIds) {
    try {
      const result = await runDiscoveryForUser(admin, userId);
      totalSuggestions += result.suggestionsFound;
    } catch {
      // continue to the next user — one failure shouldn't block the sweep
    }
  }

  return NextResponse.json({ usersProcessed: uniqueUserIds.length, totalSuggestions });
}
