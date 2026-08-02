import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncSource } from "@/lib/ingestion/sync";
import { analyzeAndStore } from "@/lib/ai/pipeline";
import { PLATFORMS_WITH_LIVE_INGESTION } from "@/lib/types";

// Sync every feed-having source in one request, on the signed-in user's own
// session. Clicking ↻ once per source does not scale past a handful, and the
// cron sweep needs a service-role key this deployment deliberately does without.
//
// Feeds are fetched concurrently — they are almost entirely network wait, and
// serialising a dozen 15-second timeouts would blow any function budget.
export const maxDuration = 60;

const INLINE_ANALYSIS_LIMIT = 8;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: sources } = await supabase
    .from("sources")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .not("feed_url", "is", null);

  const syncable = (sources ?? []).filter((s) => PLATFORMS_WITH_LIVE_INGESTION.has(s.platform));
  if (syncable.length === 0) {
    return NextResponse.json({ synced: 0, failed: 0, itemsNew: 0, results: [] });
  }

  const settled = await Promise.allSettled(syncable.map((source) => syncSource(supabase, source)));

  const results = settled.map((outcome, i) => {
    const source = syncable[i];
    if (outcome.status === "rejected") {
      const message = outcome.reason instanceof Error ? outcome.reason.message : "Sync threw unexpectedly";
      return { id: source.id, name: source.name, ok: false, itemsNew: 0, error: message };
    }
    const result = outcome.value;
    return {
      id: source.id,
      name: source.name,
      ok: !result.error,
      itemsNew: result.itemsNew,
      error: result.error,
      newItemIds: result.newItemIds,
    };
  });

  // Analyse a bounded slice inline so the dashboard has something to show
  // immediately; the analyze cron picks up the rest when one is configured.
  const newItemIds = results.flatMap((r) => ("newItemIds" in r ? (r.newItemIds ?? []) : [])).slice(
    0,
    INLINE_ANALYSIS_LIMIT
  );
  const analyzed = await Promise.all(
    newItemIds.map((itemId) =>
      analyzeAndStore(supabase, itemId).then(
        () => true,
        () => false
      )
    )
  );

  return NextResponse.json({
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    itemsNew: results.reduce((sum, r) => sum + r.itemsNew, 0),
    itemsAnalyzed: analyzed.filter(Boolean).length,
    results: results.map(({ id, name, ok, itemsNew, error }) => ({ id, name, ok, itemsNew, error })),
  });
}
