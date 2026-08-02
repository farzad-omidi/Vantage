// YouTube Data API v3 adapter.
//
// The free RSS feed (see rss.ts) already delivers a channel's new uploads with
// no credentials, so this module deliberately does NOT re-fetch videos. It
// covers the two things RSS cannot express:
//
//   1. Resolving an @handle / custom URL to a channel ID reliably. The HTML
//      fallback in rss.ts scrapes the channel page, which breaks whenever
//      YouTube reshuffles its markup or serves a consent interstitial.
//   2. Audience size, so 200 monitored accounts can be ranked by real reach
//      rather than by the order someone typed them in.
//
// Everything here is optional: with no YOUTUBE_API_KEY the callers fall back to
// the scrape and simply record no audience figure.

const API = "https://www.googleapis.com/youtube/v3/channels";

export type YouTubeChannel = {
  channelId: string;
  title: string | null;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
};

export function hasYouTubeApiKey(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

// Pulls the identifying part out of any channel URL form. Returns the lookup
// parameter the API wants, or null when the URL isn't a channel URL at all.
export function channelLookupParam(url: string): { key: "id" | "forHandle" | "forUsername"; value: string } | null {
  const trimmed = url.trim();
  const byId = trimmed.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
  if (byId) return { key: "id", value: byId[1] };

  const byHandle = trimmed.match(/youtube\.com\/@([\w.-]+)/i);
  if (byHandle) return { key: "forHandle", value: `@${byHandle[1]}` };

  // /c/Name is a vanity URL; the API has no direct lookup for it, but
  // forHandle resolves most of them because handles were seeded from them.
  const byCustom = trimmed.match(/youtube\.com\/c\/([\w.-]+)/i);
  if (byCustom) return { key: "forHandle", value: `@${byCustom[1]}` };

  const byUser = trimmed.match(/youtube\.com\/user\/([\w.-]+)/i);
  if (byUser) return { key: "forUsername", value: byUser[1] };

  return null;
}

function toNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// One `channels.list` call costs a single quota unit against the default
// 10,000/day, so this is safe to run on every sync.
export async function fetchChannel(channelUrlOrId: string, timeoutMs = 15000): Promise<YouTubeChannel | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const lookup = /^UC[\w-]{22}$/.test(channelUrlOrId.trim())
    ? ({ key: "id", value: channelUrlOrId.trim() } as const)
    : channelLookupParam(channelUrlOrId);
  if (!lookup) return null;

  const url = new URL(API);
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set(lookup.key, lookup.value);
  url.searchParams.set("key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Surface the API's own reason — quota exhaustion and a bad key look very
    // different to whoever has to fix it.
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = body.error.message;
    } catch {
      // non-JSON error body; the status line is all we have
    }
    throw new Error(`YouTube API: ${detail}`);
  }

  const body = (await res.json()) as {
    items?: Array<{
      id?: string;
      snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> };
      statistics?: { subscriberCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
    }>;
  };

  const item = body.items?.[0];
  if (!item?.id) return null;

  const thumbs = item.snippet?.thumbnails ?? {};
  return {
    channelId: item.id,
    title: item.snippet?.title ?? null,
    thumbnailUrl: thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? null,
    // Channels can hide their subscriber count; that's null, not zero.
    subscriberCount: item.statistics?.hiddenSubscriberCount ? null : toNumber(item.statistics?.subscriberCount),
    videoCount: toNumber(item.statistics?.videoCount),
  };
}

export function feedUrlForChannelId(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}
