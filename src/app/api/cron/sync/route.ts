import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/cron-auth";
import { syncSource } from "@/lib/ingestion/sync";
import { PLATFORMS_WITH_LIVE_INGESTION } from "@/lib/types";

// Scheduled sweep: sync every active, feed-having source across every user.
// Wire an external scheduler (Vercel Cron, GitHub Actions cron, cron-job.org)
// to POST here every 15-30 minutes with header `x-cron-secret: $CRON_SECRET`.
export async function POST(request: NextRequest) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const db = createAdminClient();
  if (!db) {
    return NextResponse.json(
      { error: "Scheduled sync needs SUPABASE_SERVICE_ROLE_KEY. Manual 'Sync now' works without it." },
      { status: 503 }
    );
  }

  const { data: sources, error } = await db
    .from("sources")
    .select("*")
    .eq("status", "active")
    .not("feed_url", "is", null)
    .in("platform", [...PLATFORMS_WITH_LIVE_INGESTION]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let itemsFound = 0;
  let itemsNew = 0;
  let errors = 0;

  for (const source of sources ?? []) {
    const result = await syncSource(db, source);
    itemsFound += result.itemsFound;
    itemsNew += result.itemsNew;
    if (result.error) errors += 1;
  }

  return NextResponse.json({ sourcesChecked: (sources ?? []).length, itemsFound, itemsNew, errors });
}
