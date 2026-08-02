import { XMLParser } from "fast-xml-parser";

export type FeedItem = {
  externalId: string;
  url: string | null;
  title: string | null;
  body: string | null;
  authorName: string | null;
  publishedAt: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function textOf(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string") return node;
  if (typeof node === "object" && "#text" in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)["#text"]);
  }
  return null;
}

const YOUTUBE_FEED_PREFIX = "https://www.youtube.com/feeds/videos.xml?channel_id=";
const CHANNEL_ID = /(UC[\w-]{22})/;

// YouTube publishes a free Atom feed per channel, but only keyed on the opaque
// channel ID — which is not in the URL you get from the browser for an @handle,
// /c/ or /user/ channel. Rather than making people dig it out of page source,
// we accept any channel URL and resolve it here.
export function isYouTubeChannelUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?youtube\.com\/(@[\w.-]+|channel\/|c\/|user\/)/i.test(url.trim());
}

export async function resolveYouTubeFeedUrl(channelUrl: string, timeoutMs = 15000): Promise<string> {
  // A /channel/UC… URL already carries the ID — no network call needed.
  const fromPath = channelUrl.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
  if (fromPath) return YOUTUBE_FEED_PREFIX + fromPath[1];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(channelUrl, {
      signal: controller.signal,
      // The channel page serves a consent interstitial to unrecognized agents,
      // and the ID is absent from that page.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new Error(`YouTube channel page returned ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const match =
    html.match(/"channelId":"(UC[\w-]{22})"/) ??
    html.match(/rel="canonical"[^>]*\/channel\/(UC[\w-]{22})/) ??
    html.match(/<meta[^>]+itemprop="identifier"[^>]+content="(UC[\w-]{22})"/) ??
    html.match(CHANNEL_ID);
  if (!match) {
    throw new Error(
      "Couldn't find the channel ID on that YouTube page. Open the channel, click any video, " +
        "then use the .../channel/UC… form of the URL instead."
    );
  }
  return YOUTUBE_FEED_PREFIX + match[1];
}

// Fetches and normalizes an RSS 2.0 or Atom feed. No auth, no API key —
// this is the one ingestion path that works out of the box (see
// docs/ARCHITECTURE.md for the adapter pattern to add Twitter/LinkedIn's
// paid APIs alongside this).
// Identifies the crawler honestly, but in the "Mozilla/5.0 (compatible; …)"
// form every other feed reader uses. A bare product token gets a blanket 403
// from the WAFs in front of a lot of ordinary WordPress sites.
const FEED_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; VantageBot/1.0; +https://github.com/farzad-omidi/vantage)",
  Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7",
  "Accept-Language": "en;q=0.9,id;q=0.8",
} as const;

export async function fetchFeed(feedUrl: string, timeoutMs = 15000): Promise<FeedItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(feedUrl, { signal: controller.signal, headers: FEED_HEADERS, redirect: "follow" });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(describeFeedFailure(res.status, res.statusText));
  }
  const xml = await res.text();
  const items = parseFeedXml(xml);
  if (items.length === 0 && !looksLikeFeed(xml)) {
    throw new Error(
      "That URL returned a web page, not a feed. Look for the site's RSS link — it's usually /feed, /rss or /feed.xml."
    );
  }
  return items;
}

function looksLikeFeed(xml: string): boolean {
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(xml.slice(0, 2000));
}

// The status code is the whole diagnosis for a feed fetch, so say what it means
// rather than making someone look it up.
function describeFeedFailure(status: number, statusText: string): string {
  const base = `Feed returned ${status}${statusText ? ` ${statusText}` : ""}`;
  if (status === 403 || status === 406)
    return `${base} — the site is blocking automated fetches. Some hosts allow the feed only from a browser; there may be no way in short of a proxy.`;
  if (status === 404) return `${base} — no feed at that URL. Try /feed, /rss, /feed.xml or /?feed=rss2.`;
  if (status === 429) return `${base} — rate limited. Sync this source less often.`;
  if (status >= 500) return `${base} — the site is having problems. Worth retrying later.`;
  return base;
}

// Pure parsing step, split out from fetchFeed so it's unit-testable without
// mocking network calls.
export function parseFeedXml(xml: string): FeedItem[] {
  const doc = parser.parse(xml);

  // RSS 2.0: rss.channel.item[]
  const rssItems = toArray(doc?.rss?.channel?.item);
  if (rssItems.length > 0) {
    return rssItems.map((item): FeedItem => {
      const link = textOf(item.link) ?? (typeof item.link === "object" ? item.link?.["@_href"] : null);
      const guid = textOf(item.guid) ?? link ?? textOf(item.title) ?? crypto.randomUUID();
      return {
        externalId: guid,
        url: link ?? null,
        title: stripHtml(textOf(item.title)),
        body: stripHtml(textOf(item["content:encoded"]) ?? textOf(item.description)),
        authorName: stripHtml(textOf(item.author) ?? textOf(item["dc:creator"])),
        publishedAt: normalizeDate(textOf(item.pubDate) ?? textOf(item.pubdate)),
      };
    });
  }

  // Atom: feed.entry[]
  const atomEntries = toArray(doc?.feed?.entry);
  if (atomEntries.length > 0) {
    return atomEntries.map((entry): FeedItem => {
      const links = toArray(entry.link);
      const link = links.find((l) => l?.["@_rel"] === "alternate")?.["@_href"] ?? links[0]?.["@_href"] ?? null;
      return {
        externalId: textOf(entry.id) ?? link ?? crypto.randomUUID(),
        url: link ?? null,
        title: stripHtml(textOf(entry.title)),
        body: stripHtml(textOf(entry.summary) ?? textOf(entry.content)),
        authorName: stripHtml(textOf(entry.author?.name)),
        publishedAt: normalizeDate(textOf(entry.published) ?? textOf(entry.updated)),
      };
    });
  }

  return [];
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
