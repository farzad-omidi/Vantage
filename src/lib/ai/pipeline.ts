import type { VantageClient } from "@/lib/supabase/types";
import { PRIORITY_ORDER } from "@/lib/types";
import { analyzeContent } from "@/lib/ai/analyze";
import { DEFAULT_LANGUAGE } from "@/lib/languages";

// Analyzes one content item, stores the result, and raises an alert if it
// clears the user's bar for one. Called inline (a few items) after a manual
// "Sync now", and in batches by the analyze cron for everything else.
export async function analyzeAndStore(db: VantageClient, contentItemId: string): Promise<void> {
  const { data: item } = await db.from("content_items").select("*").eq("id", contentItemId).single();
  if (!item) return;

  const { data: existing } = await db
    .from("content_analysis")
    .select("id")
    .eq("content_item_id", contentItemId)
    .maybeSingle();
  if (existing) return;

  const [{ data: source }, { data: matches }, { data: profile }] = await Promise.all([
    item.source_id ? db.from("sources").select("name, description").eq("id", item.source_id).single() : Promise.resolve({ data: null }),
    db.from("content_topic_matches").select("topic_id").eq("content_item_id", contentItemId),
    db.from("profiles").select("preferred_language").eq("id", item.user_id).maybeSingle(),
  ]);

  const topicIds = (matches ?? []).map((m) => m.topic_id);
  const { data: topics } =
    topicIds.length > 0
      ? await db.from("topics").select("id, name, description, keywords").in("id", topicIds)
      : { data: [] };

  const analysis = await analyzeContent({
    title: item.title,
    body: item.body,
    authorName: item.author_name,
    platform: item.platform,
    url: item.url,
    sourceName: source?.name ?? item.author_name,
    sourceDescription: source?.description ?? null,
    topics: (topics ?? []).map((t) => ({ name: t.name, description: t.description, keywords: t.keywords })),
    // Analysis is written in the reader's language, not the content's.
    outputLanguage: profile?.preferred_language ?? DEFAULT_LANGUAGE,
  });

  await db.from("content_analysis").insert({
    content_item_id: contentItemId,
    user_id: item.user_id,
    is_relevant: analysis.isRelevant,
    relevance_score: analysis.relevanceScore,
    classification: analysis.classification,
    summary: analysis.summary,
    importance_explanation: analysis.importanceExplanation,
    opportunities: analysis.opportunities,
    priority: analysis.priority,
    sentiment: analysis.sentiment,
    language: analysis.language,
    title_translated: analysis.titleTranslated,
    model: process.env.ANTHROPIC_ANALYSIS_MODEL || "claude-haiku-4-5",
  });

  if (!analysis.isRelevant) return;
  await maybeCreateAlert(db, item, analysis, topicIds);
}

async function maybeCreateAlert(
  db: VantageClient,
  item: { id: string; user_id: string; source_id: string | null; title: string | null; body: string | null },
  analysis: Awaited<ReturnType<typeof analyzeContent>>,
  topicIds: string[]
) {
  const { data: rules } = await db
    .from("alert_rules")
    .select("*")
    .eq("user_id", item.user_id)
    .eq("active", true);

  let shouldAlert = false;
  let matchedTopicId: string | null = topicIds[0] ?? null;

  if (rules && rules.length > 0) {
    for (const rule of rules) {
      const topicOk = !rule.topic_id || topicIds.includes(rule.topic_id);
      const sourceOk = !rule.source_id || rule.source_id === item.source_id;
      const priorityOk = PRIORITY_ORDER[analysis.priority] >= PRIORITY_ORDER[rule.min_priority];
      if (topicOk && sourceOk && priorityOk && (rule.topic_id || rule.source_id)) {
        shouldAlert = true;
        matchedTopicId = rule.topic_id ?? matchedTopicId;
        break;
      }
    }
  } else {
    // No rules configured — default: alert on high/urgent findings only.
    shouldAlert = PRIORITY_ORDER[analysis.priority] >= PRIORITY_ORDER.high;
  }

  if (!shouldAlert) return;

  await db.from("alerts").insert({
    user_id: item.user_id,
    content_item_id: item.id,
    source_id: item.source_id,
    topic_id: matchedTopicId,
    title: analysis.titleTranslated || item.title || (item.body ?? "New relevant content").slice(0, 80),
    message: analysis.summary,
    priority: analysis.priority,
  });
}
