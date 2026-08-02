import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/cron-auth";
import { analyzeAndStore } from "@/lib/ai/pipeline";

// Scheduled sweep: analyze any content_items that don't yet have a
// content_analysis row (ingested by cron/sync, or by a manual sync that
// exceeded the inline analysis batch). Run this a few minutes behind
// cron/sync. Bounded per run to keep serverless function duration sane.
const BATCH_SIZE = 25;

export async function POST(request: NextRequest) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const admin = createAdminClient();

  const { data: analyzed } = await admin.from("content_analysis").select("content_item_id");
  const analyzedIds = new Set((analyzed ?? []).map((a) => a.content_item_id));

  const { data: recentItems } = await admin
    .from("content_items")
    .select("id")
    .order("fetched_at", { ascending: false })
    .limit(500);

  const pending = (recentItems ?? []).map((i) => i.id).filter((id) => !analyzedIds.has(id)).slice(0, BATCH_SIZE);

  let succeeded = 0;
  let failed = 0;
  for (const id of pending) {
    try {
      await analyzeAndStore(admin, id);
      succeeded += 1;
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({ pending: pending.length, succeeded, failed });
}
