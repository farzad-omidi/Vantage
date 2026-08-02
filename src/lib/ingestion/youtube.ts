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

// ---------------------------------------------------------------------------
// Discovery
//
// Quota is the whole design constraint here. Against 10,000 units/day:
//   search.list        100 units  — scarce, ~50 calls/day at most
//   channels.list        1 unit   — and takes up to 50 ids at once
//   playlistItems.list   1 unit
//   videos.list          1 unit   — also batches 50 ids
// So: search rarely, enrich freely.
// ---------------------------------------------------------------------------

const SEARCH_API = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_API = "https://www.googleapis.com/youtube/v3/videos";
const PLAYLIST_ITEMS_API = "https://www.googleapis.com/youtube/v3/playlistItems";

async function callApi<T>(url: URL, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = body.error.message;
    } catch {
      // non-JSON error body
    }
    throw new Error(`YouTube API: ${detail}`);
  }
  return (await res.json()) as T;
}

function withKey(base: string, params: Record<string, string>): URL {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", process.env.YOUTUBE_API_KEY!);
  return url;
}

// 100 quota units. Returns channel IDs only — details come from the far
// cheaper channels.list batch.
export async function searchChannelIds(
  query: string,
  opts: { regionCode?: string; relevanceLanguage?: string; maxResults?: number } = {}
): Promise<string[]> {
  if (!process.env.YOUTUBE_API_KEY) return [];
  const url = withKey(SEARCH_API, {
    part: "id",
    type: "channel",
    q: query,
    maxResults: String(opts.maxResults ?? 25),
    ...(opts.regionCode ? { regionCode: opts.regionCode } : {}),
    ...(opts.relevanceLanguage ? { relevanceLanguage: opts.relevanceLanguage } : {}),
  });
  const body = await callApi<{ items?: Array<{ id?: { channelId?: string } }> }>(url);
  return (body.items ?? []).map((i) => i.id?.channelId).filter((id): id is string => Boolean(id));
}

export type YouTubeChannelDetail = YouTubeChannel & { description: string | null; customUrl: string | null };

// 1 quota unit per batch of 50.
export async function fetchChannelsByIds(ids: string[]): Promise<YouTubeChannelDetail[]> {
  if (!process.env.YOUTUBE_API_KEY || ids.length === 0) return [];
  const out: YouTubeChannelDetail[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url = withKey(API, { part: "snippet,statistics", id: batch.join(",") });
    const body = await callApi<{
      items?: Array<{
        id?: string;
        snippet?: {
          title?: string;
          description?: string;
          customUrl?: string;
          thumbnails?: Record<string, { url?: string }>;
        };
        statistics?: { subscriberCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
      }>;
    }>(url);
    for (const item of body.items ?? []) {
      if (!item.id) continue;
      const thumbs = item.snippet?.thumbnails ?? {};
      out.push({
        channelId: item.id,
        title: item.snippet?.title ?? null,
        description: item.snippet?.description ?? null,
        customUrl: item.snippet?.customUrl ?? null,
        thumbnailUrl: thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? null,
        subscriberCount: item.statistics?.hiddenSubscriberCount ? null : toNumber(item.statistics?.subscriberCount),
        videoCount: toNumber(item.statistics?.videoCount),
      });
    }
  }
  return out;
}

// Median views across recent uploads. Median rather than mean because one
// viral video otherwise triples the apparent reach of an ordinary channel.
// Costs 2 quota units per channel.
export async function fetchRecentViewStats(
  channelId: string,
  sampleSize = 12
): Promise<{ medianViews: number | null; sampled: number }> {
  if (!process.env.YOUTUBE_API_KEY) return { medianViews: null, sampled: 0 };
  // Every channel's uploads playlist is its ID with the UC prefix swapped for
  // UU — documented YouTube behaviour, and it saves a contentDetails lookup.
  const uploadsPlaylist = `UU${channelId.slice(2)}`;

  let videoIds: string[] = [];
  try {
    const listUrl = withKey(PLAYLIST_ITEMS_API, {
      part: "contentDetails",
      playlistId: uploadsPlaylist,
      maxResults: String(sampleSize),
    });
    const list = await callApi<{ items?: Array<{ contentDetails?: { videoId?: string } }> }>(listUrl);
    videoIds = (list.items ?? []).map((i) => i.contentDetails?.videoId).filter((v): v is string => Boolean(v));
  } catch {
    // Uploads playlist can be empty or private.
    return { medianViews: null, sampled: 0 };
  }
  if (videoIds.length === 0) return { medianViews: null, sampled: 0 };

  const statsUrl = withKey(VIDEOS_API, { part: "statistics", id: videoIds.join(",") });
  const stats = await callApi<{ items?: Array<{ statistics?: { viewCount?: string } }> }>(statsUrl);
  const views = (stats.items ?? [])
    .map((i) => toNumber(i.statistics?.viewCount))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  if (views.length === 0) return { medianViews: null, sampled: 0 };

  const mid = Math.floor(views.length / 2);
  const median = views.length % 2 === 0 ? Math.round((views[mid - 1] + views[mid]) / 2) : views[mid];
  return { medianViews: median, sampled: views.length };
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g;
// Indonesian mobile numbers as actually written in a channel bio: "+62 812 2222
// 3800", "081399251460", "+62-812-2222-3800". The separator after the country
// code is optional and usually present.
const WHATSAPP_RE = /(?:\+?62[\s.-]?|\b0)8\d{2}[\s.-]?\d{3,4}[\s.-]?\d{3,5}\b/g;

// Channel descriptions routinely carry the business contact the owner wants
// to be reached on. The "View email address" button on the channel page is
// CAPTCHA-gated and not exposed by the API, so this is the only route.
export function extractContacts(text: string | null): { emails: string[]; phones: string[] } {
  if (!text) return { emails: [], phones: [] };
  const emails = [...new Set(text.match(EMAIL_RE) ?? [])].filter((e) => !/\.(png|jpg|jpeg|gif|webp)$/i.test(e));
  const phones = [...new Set((text.match(WHATSAPP_RE) ?? []).map((p) => p.replace(/[\s.-]/g, "")))];
  return { emails: emails.slice(0, 3), phones: phones.slice(0, 3) };
}
