import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncSource } from "@/lib/ingestion/sync";
import { analyzeAndStore } from "@/lib/ai/pipeline";

// Manual "Sync now" — the request is authenticated as the signed-in user
// (verified below), but the actual ingestion writes go through the admin
// client, since content_items has no client-facing insert policy (see
// supabase/schema.sql). Also runs AI analysis inline on a small batch of the
// new items so the UI feels responsive; the cron sweep catches the rest.
const INLINE_ANALYSIS_LIMIT = 5;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: source } = await supabase.from("sources").select("*").eq("id", id).eq("user_id", user.id).single();
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const result = await syncSource(admin, source);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const toAnalyze = result.newItemIds.slice(0, INLINE_ANALYSIS_LIMIT);
  await Promise.all(toAnalyze.map((itemId) => analyzeAndStore(admin, itemId).catch(() => null)));

  return NextResponse.json({
    itemsFound: result.itemsFound,
    itemsNew: result.itemsNew,
    itemsAnalyzed: toAnalyze.length,
  });
}
