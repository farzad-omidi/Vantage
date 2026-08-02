import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncSource } from "@/lib/ingestion/sync";
import { analyzeAndStore } from "@/lib/ai/pipeline";

// Manual "Sync now". Runs entirely on the signed-in user's session — RLS keeps
// every read and write scoped to their own rows, so no service-role key is
// needed for the app to be fully functional. Also runs AI analysis inline on a
// small batch of the new items so the UI feels responsive; the analyze cron
// picks up anything beyond that.
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

  const result = await syncSource(supabase, source);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Analysis is best-effort: a missing/rate-limited ANTHROPIC_API_KEY must not
  // fail the sync, since the ingested content is still useful on its own.
  const toAnalyze = result.newItemIds.slice(0, INLINE_ANALYSIS_LIMIT);
  const analyzed = await Promise.all(
    toAnalyze.map((itemId) =>
      analyzeAndStore(supabase, itemId).then(
        () => true,
        () => false
      )
    )
  );

  return NextResponse.json({
    itemsFound: result.itemsFound,
    itemsNew: result.itemsNew,
    itemsAnalyzed: analyzed.filter(Boolean).length,
  });
}
