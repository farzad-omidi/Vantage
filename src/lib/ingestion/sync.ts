import { createHash } from "node:crypto";
import type { Tables } from "@/lib/database.types";
import type { VantageClient } from "@/lib/supabase/types";
import { fetchFeed, isYouTubeChannelUrl, resolveYouTubeFeedUrl } from "@/lib/ingestion/rss";
import { fetchChannel, feedUrlForChannelId, hasYouTubeApiKey } from "@/lib/ingestion/youtube";

type Source = Tables<"sources">;

export type SyncResult = {
  itemsFound: number;
  itemsNew: number;
  newItemIds: string[];
  error: string | null;
};

function contentHash(userId: string, sourceId: string, externalId: string): string {
  return createHash("sha256").update(`${userId}:${sourceId}:${externalId}`).digest("hex");
}

// Ingests one source's feed, dedupes against what's already stored, matches
// new items against the user's active topic keywords, and logs the run.
// Called both by the manual "Sync now" button (src/app/api/sources/[id]/sync)
// and the scheduled cron sweep (src/app/api/cron/sync).
export async function syncSource(db: VantageClient, source: Source): Promise<SyncResult> {
  if (!source.feed_url) {
    return { itemsFound: 0, itemsNew: 0, newItemIds: [], error: "This source has no feed URL configured." };
  }

  let items;
  try {
    items = await fetchFeed(await resolveFeedUrl(db, source));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown fetch error";
    await db.from("ingestion_runs").insert({
      user_id: source.user_id,
      source_id: source.id,
      status: "error",
      error: message,
    });
    await db
      .from("sources")
      .update({ last_synced_at: new Date().toISOString(), last_sync_status: "error", last_sync_error: message })
      .eq("id", source.id);
    return { itemsFound: 0, itemsNew: 0, newItemIds: [], error: message };
  }

  const rows = items.map((item) => ({
    user_id: source.user_id,
    source_id: source.id,
    platform: source.platform,
    external_id: item.externalId,
    url: item.url,
    author_name: item.authorName ?? source.name,
    author_handle: source.handle,
    title: item.title,
    body: item.body,
    content_hash: contentHash(source.user_id, source.id, item.externalId),
    published_at: item.publishedAt,
  }));

  let newItemIds: string[] = [];
  if (rows.length > 0) {
    const { data: inserted, error: insertError } = await db
      .from("content_items")
      .upsert(rows, { onConflict: "user_id,content_hash", ignoreDuplicates: true })
      .select("id");

    if (insertError) {
      await db.from("ingestion_runs").insert({
        user_id: source.user_id,
        source_id: source.id,
        status: "error",
        items_found: rows.length,
        error: insertError.message,
      });
      return { itemsFound: rows.length, itemsNew: 0, newItemIds: [], error: insertError.message };
    }
    newItemIds = (inserted ?? []).map((r) => r.id);
  }

  if (newItemIds.length > 0) {
    await matchNewItemsToTopics(db, source.user_id, newItemIds);
  }

  await refreshYouTubeAudience(db, source);

  await db.from("ingestion_runs").insert({
    user_id: source.user_id,
    source_id: source.id,
    status: "success",
    items_found: rows.length,
    items_new: newItemIds.length,
  });
  await db
    .from("sources")
    .update({ last_synced_at: new Date().toISOString(), last_sync_status: "success", last_sync_error: null })
    .eq("id", source.id);

  return { itemsFound: rows.length, itemsNew: newItemIds.length, newItemIds, error: null };
}

// A YouTube channel URL isn't a feed, but it's what you can actually copy from
// the browser. Resolve it to the channel's Atom feed once and write the result
// back, so every later sync is a plain feed fetch.
//
// With YOUTUBE_API_KEY set this also picks up the subscriber count, which is
// the only reliable way to rank a large monitored list by actual reach. Without
// the key it falls back to scraping the channel page for the ID alone.
async function resolveFeedUrl(db: VantageClient, source: Source): Promise<string> {
  const feedUrl = source.feed_url!;
  if (!isYouTubeChannelUrl(feedUrl)) return feedUrl;

  if (hasYouTubeApiKey()) {
    const channel = await fetchChannel(feedUrl);
    if (channel) {
      const resolved = feedUrlForChannelId(channel.channelId);
      await db
        .from("sources")
        .update({
          feed_url: resolved,
          audience_size: channel.subscriberCount,
          audience_checked_at: new Date().toISOString(),
          avatar_url: channel.thumbnailUrl,
        })
        .eq("id", source.id);
      return resolved;
    }
    // A key that resolves nothing means the handle is wrong, not that the API
    // is broken — fetchChannel throws on genuine API failures.
  }

  const resolved = await resolveYouTubeFeedUrl(feedUrl);
  await db.from("sources").update({ feed_url: resolved }).eq("id", source.id);
  return resolved;
}

// Refreshes subscriber count for an already-resolved YouTube feed. Costs one
// quota unit per source against a 10,000/day allowance.
async function refreshYouTubeAudience(db: VantageClient, source: Source) {
  if (source.platform !== "youtube" || !hasYouTubeApiKey()) return;
  const channelId = source.feed_url?.match(/channel_id=(UC[\w-]{22})/)?.[1];
  if (!channelId) return;
  try {
    const channel = await fetchChannel(channelId);
    if (!channel) return;
    await db
      .from("sources")
      .update({
        audience_size: channel.subscriberCount,
        audience_checked_at: new Date().toISOString(),
        avatar_url: channel.thumbnailUrl ?? source.avatar_url,
      })
      .eq("id", source.id);
  } catch {
    // Audience enrichment is a nice-to-have; never fail a sync over it.
  }
}

async function matchNewItemsToTopics(db: VantageClient, userId: string, itemIds: string[]) {
  const { data: topics } = await db
    .from("topics")
    .select("id, keywords")
    .eq("user_id", userId)
    .eq("status", "active");
  if (!topics || topics.length === 0) return;

  const { data: newItems } = await db.from("content_items").select("id, title, body").in("id", itemIds);
  if (!newItems) return;

  const matches: { content_item_id: string; topic_id: string; user_id: string; match_reason: "keyword" }[] = [];
  for (const item of newItems) {
    const haystack = `${item.title ?? ""} ${item.body ?? ""}`.toLowerCase();
    if (!haystack.trim()) continue;
    for (const topic of topics) {
      if (topic.keywords.length === 0) continue;
      const hit = topic.keywords.some((kw) => kw.trim() && haystack.includes(kw.trim().toLowerCase()));
      if (hit) {
        matches.push({ content_item_id: item.id, topic_id: topic.id, user_id: userId, match_reason: "keyword" });
      }
    }
  }

  if (matches.length > 0) {
    await db.from("content_topic_matches").upsert(matches, { onConflict: "content_item_id,topic_id", ignoreDuplicates: true });
  }
}
