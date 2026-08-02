import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runDiscoveryForUser } from "@/lib/ai/discoveryRun";
import { runYouTubeDiscoveryForUser } from "@/lib/ingestion/youtubeDiscovery";

// Two independent discovery engines write into the same source_suggestions
// table: Claude with web search, and YouTube channel search. Either can be
// unconfigured, so each is guarded separately, and a failure in one must not
// discard the results of the other.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasYouTube = Boolean(process.env.YOUTUBE_API_KEY);
  if (!hasAnthropic && !hasYouTube) {
    return NextResponse.json(
      { error: "Discovery needs ANTHROPIC_API_KEY or YOUTUBE_API_KEY configured on the server." },
      { status: 503 }
    );
  }

  // Bias the YouTube search toward the market the topics are written for,
  // rather than hard-coding one.
  const { data: topicLocale } = await supabase
    .from("topics")
    .select("language, region")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);
  const regionCode = topicLocale?.[0]?.region ?? undefined;
  const relevanceLanguage = topicLocale?.[0]?.language ?? undefined;

  const errors: string[] = [];
  let fromClaude = 0;
  let fromYouTube = 0;
  let searchesUsed = 0;

  if (hasAnthropic) {
    try {
      ({ suggestionsFound: fromClaude } = await runDiscoveryForUser(supabase, user.id));
    } catch (err) {
      errors.push(`Web discovery: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  if (hasYouTube) {
    try {
      ({ suggestionsFound: fromYouTube, searchesUsed } = await runYouTubeDiscoveryForUser(supabase, user.id, {
        regionCode,
        relevanceLanguage,
      }));
    } catch (err) {
      errors.push(`YouTube discovery: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  const suggestionsFound = fromClaude + fromYouTube;

  // Both engines failing is a failure. One failing while the other returns
  // results is a partial success worth reporting rather than discarding.
  if (errors.length > 0 && suggestionsFound === 0) {
    return NextResponse.json({ error: errors.join(" · ") }, { status: 502 });
  }

  return NextResponse.json({
    suggestionsFound,
    fromClaude,
    fromYouTube,
    searchesUsed,
    ...(errors.length > 0 ? { warning: errors.join(" · ") } : {}),
  });
}
