import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { discoverSourcesForTopic } from "@/lib/ai/discover";

type AdminClient = SupabaseClient<Database>;

const MAX_TOPICS_PER_RUN = 3;

// Runs the discovery engine across a user's highest-priority active topics
// and stores results as source_suggestions for review in the Discovery tab.
// Capped per run since each topic costs a web-search-enabled model call.
export async function runDiscoveryForUser(admin: AdminClient, userId: string): Promise<{ suggestionsFound: number }> {
  const { data: topics } = await admin
    .from("topics")
    .select("id, name, description, priority")
    .eq("user_id", userId)
    .eq("status", "active");

  if (!topics || topics.length === 0) return { suggestionsFound: 0 };

  const priorityRank: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
  const ranked = [...topics].sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority]).slice(0, MAX_TOPICS_PER_RUN);

  const { data: existingSources } = await admin.from("sources").select("name, handle").eq("user_id", userId);
  const { data: existingSuggestions } = await admin
    .from("source_suggestions")
    .select("name, handle")
    .eq("user_id", userId);
  const excludeNames = [
    ...(existingSources ?? []).flatMap((s) => [s.name, s.handle].filter(Boolean) as string[]),
    ...(existingSuggestions ?? []).flatMap((s) => [s.name, s.handle].filter(Boolean) as string[]),
  ];

  let suggestionsFound = 0;
  for (const topic of ranked) {
    const suggestions = await discoverSourcesForTopic(topic.name, topic.description, excludeNames);
    if (suggestions.length === 0) continue;

    const rows = suggestions.map((s) => ({
      user_id: userId,
      name: s.name,
      handle: s.handle,
      platform: s.platform as Database["public"]["Tables"]["source_suggestions"]["Row"]["platform"],
      url: s.url,
      reason: s.reason,
      based_on_topic_id: topic.id,
      mention_count: 1,
    }));

    const { error } = await admin
      .from("source_suggestions")
      .upsert(rows, { onConflict: "user_id,platform,dedupe_key", ignoreDuplicates: true });
    if (!error) suggestionsFound += rows.length;
  }

  return { suggestionsFound };
}
