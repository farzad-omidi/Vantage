import type { VantageClient } from "@/lib/supabase/types";
import {
  extractContacts,
  fetchChannelsByIds,
  fetchRecentViewStats,
  hasYouTubeApiKey,
  searchChannelIds,
  type YouTubeChannelDetail,
} from "@/lib/ingestion/youtube";

// search.list costs 100 quota units against a 10,000/day allowance, so the
// number of searches per run is the thing to keep honest. One query per topic,
// three topics, is 300 units — enrichment for everything found costs about
// another 250.
const MAX_TOPICS_PER_RUN = 3;
const CANDIDATES_PER_TOPIC = 25;
// Ranking by real views costs 2 units a channel, so only the plausible ones
// are measured.
const MEASURE_TOP_N = 10;
const MIN_SUBSCRIBERS = 1_000;

type Ranked = YouTubeChannelDetail & {
  medianViews: number | null;
  /** Median views as a share of subscribers — the honest reach signal. */
  reachRatio: number | null;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/^@/, "").trim();
}

// Turns a topic into a YouTube query. The topic's own keywords are better
// search terms than its name, which tends to be a label rather than a phrase
// anyone would type.
function queryForTopic(name: string, keywords: string[]): string {
  const usable = keywords.map((k) => k.trim()).filter((k) => k.length > 3 && !/^\d+$/.test(k));
  if (usable.length === 0) return name;
  return usable.slice(0, 4).join(" | ");
}

function describe(channel: Ranked, contacts: { emails: string[]; phones: string[] }, topicName: string): string {
  const bits: string[] = [];
  if (channel.subscriberCount != null) bits.push(`${channel.subscriberCount.toLocaleString()} subscribers`);
  if (channel.medianViews != null) bits.push(`${channel.medianViews.toLocaleString()} median views`);
  if (channel.reachRatio != null) bits.push(`${(channel.reachRatio * 100).toFixed(1)}% reach`);
  if (channel.videoCount != null) bits.push(`${channel.videoCount.toLocaleString()} videos`);
  if (contacts.emails.length > 0) bits.push(`contact: ${contacts.emails.join(", ")}`);
  if (contacts.phones.length > 0) bits.push(`phone: ${contacts.phones.join(", ")}`);
  return `Found via YouTube search for "${topicName}". ${bits.join(" · ")}`;
}

// Second discovery engine, alongside the Claude web-search one. Writes into the
// same source_suggestions table, so the Discovery screen's approve/dismiss flow
// covers both without changes.
export async function runYouTubeDiscoveryForUser(
  db: VantageClient,
  userId: string,
  opts: { regionCode?: string; relevanceLanguage?: string } = {}
): Promise<{ suggestionsFound: number; searchesUsed: number }> {
  if (!hasYouTubeApiKey()) return { suggestionsFound: 0, searchesUsed: 0 };

  const { data: topics } = await db
    .from("topics")
    .select("id, name, keywords, priority")
    .eq("user_id", userId)
    .eq("status", "active");
  if (!topics || topics.length === 0) return { suggestionsFound: 0, searchesUsed: 0 };

  const priorityRank: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
  const ranked = [...topics]
    .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority])
    .slice(0, MAX_TOPICS_PER_RUN);

  // Anything already tracked or already proposed is not a discovery.
  const { data: sources } = await db.from("sources").select("name, handle, feed_url, profile_url").eq("user_id", userId);
  const { data: seen } = await db.from("source_suggestions").select("name, handle, url").eq("user_id", userId);
  const known = new Set<string>();
  for (const s of sources ?? []) {
    for (const v of [s.name, s.handle]) if (v) known.add(normalize(v));
    const id = s.feed_url?.match(/channel_id=(UC[\w-]{22})/)?.[1] ?? s.profile_url?.match(/(UC[\w-]{22})/)?.[1];
    if (id) known.add(id.toLowerCase());
  }
  for (const s of seen ?? []) {
    for (const v of [s.name, s.handle]) if (v) known.add(normalize(v));
    const id = s.url?.match(/(UC[\w-]{22})/)?.[1];
    if (id) known.add(id.toLowerCase());
  }

  let suggestionsFound = 0;
  let searchesUsed = 0;

  for (const topic of ranked) {
    const query = queryForTopic(topic.name, topic.keywords);
    const ids = await searchChannelIds(query, {
      regionCode: opts.regionCode,
      relevanceLanguage: opts.relevanceLanguage,
      maxResults: CANDIDATES_PER_TOPIC,
    });
    searchesUsed += 1;
    if (ids.length === 0) continue;

    const fresh = ids.filter((id) => !known.has(id.toLowerCase()));
    if (fresh.length === 0) continue;

    const channels = (await fetchChannelsByIds(fresh)).filter(
      (c) =>
        !known.has(normalize(c.title)) &&
        !known.has(normalize(c.customUrl)) &&
        (c.subscriberCount ?? 0) >= MIN_SUBSCRIBERS
    );
    if (channels.length === 0) continue;

    // Measure only the biggest handful; reach ranking is what the extra quota
    // buys, and it is wasted on channels that will not make the cut anyway.
    const toMeasure = [...channels]
      .sort((a, b) => (b.subscriberCount ?? 0) - (a.subscriberCount ?? 0))
      .slice(0, MEASURE_TOP_N);

    const measured: Ranked[] = [];
    for (const channel of toMeasure) {
      let medianViews: number | null = null;
      try {
        ({ medianViews } = await fetchRecentViewStats(channel.channelId));
      } catch {
        // Reach is an enrichment; a channel is still worth proposing without it.
      }
      const subs = channel.subscriberCount ?? 0;
      measured.push({
        ...channel,
        medianViews,
        reachRatio: medianViews != null && subs > 0 ? medianViews / subs : null,
      });
    }

    // Rank by median views, not subscribers: a 1M-subscriber channel that gets
    // 5k views is worth less to an outreach list than a 50k one getting 30k.
    measured.sort((a, b) => (b.medianViews ?? 0) - (a.medianViews ?? 0));

    const rows = measured.map((channel) => {
      const contacts = extractContacts(channel.description);
      return {
        user_id: userId,
        name: channel.title ?? channel.channelId,
        handle: channel.customUrl ?? null,
        platform: "youtube" as const,
        url: `https://www.youtube.com/channel/${channel.channelId}`,
        reason: describe(channel, contacts, topic.name),
        based_on_topic_id: topic.id,
        mention_count: 1,
      };
    });

    const { error } = await db
      .from("source_suggestions")
      .upsert(rows, { onConflict: "user_id,platform,dedupe_key", ignoreDuplicates: true });
    if (!error) {
      suggestionsFound += rows.length;
      for (const row of rows) known.add(normalize(row.handle ?? row.name));
    }
  }

  return { suggestionsFound, searchesUsed };
}
