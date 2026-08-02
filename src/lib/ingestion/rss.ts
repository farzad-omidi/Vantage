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

// Fetches and normalizes an RSS 2.0 or Atom feed. No auth, no API key —
// this is the one ingestion path that works out of the box (see
// docs/ARCHITECTURE.md for the adapter pattern to add Twitter/LinkedIn's
// paid APIs alongside this).
export async function fetchFeed(feedUrl: string, timeoutMs = 15000): Promise<FeedItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "VantageBot/1.0 (+https://github.com/farzad-omidi/vantage)" },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`Feed returned ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  return parseFeedXml(xml);
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
