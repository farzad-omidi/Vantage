import { describe, expect, it } from "vitest";
import { isYouTubeChannelUrl, parseFeedXml, resolveYouTubeFeedUrl } from "@/lib/ingestion/rss";
import { channelLookupParam } from "@/lib/ingestion/youtube";

const RSS_SAMPLE = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Blog</title>
    <item>
      <title>Hello &amp; welcome</title>
      <link>https://example.com/hello</link>
      <guid>https://example.com/hello</guid>
      <description><![CDATA[<p>First <b>post</b> body.</p>]]></description>
      <pubDate>Mon, 01 Jun 2026 12:00:00 GMT</pubDate>
      <dc:creator>Jane Doe</dc:creator>
    </item>
  </channel>
</rss>`;

const ATOM_SAMPLE = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <entry>
    <title>Atom entry title</title>
    <id>urn:uuid:1234</id>
    <link rel="alternate" href="https://example.com/entry" />
    <summary>An atom summary.</summary>
    <published>2026-06-01T12:00:00Z</published>
    <author><name>Alex Author</name></author>
  </entry>
</feed>`;

describe("parseFeedXml", () => {
  it("parses RSS 2.0 items", () => {
    const items = parseFeedXml(RSS_SAMPLE);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Hello & welcome");
    expect(items[0].url).toBe("https://example.com/hello");
    expect(items[0].externalId).toBe("https://example.com/hello");
    expect(items[0].body).toContain("First post body.");
    expect(items[0].authorName).toBe("Jane Doe");
    expect(items[0].publishedAt).toBe(new Date("Mon, 01 Jun 2026 12:00:00 GMT").toISOString());
  });

  it("parses Atom entries", () => {
    const items = parseFeedXml(ATOM_SAMPLE);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Atom entry title");
    expect(items[0].url).toBe("https://example.com/entry");
    expect(items[0].externalId).toBe("urn:uuid:1234");
    expect(items[0].body).toBe("An atom summary.");
    expect(items[0].authorName).toBe("Alex Author");
  });

  it("returns an empty array for unrecognized XML", () => {
    expect(parseFeedXml("<xml></xml>")).toEqual([]);
  });
});

describe("YouTube channel URLs", () => {
  it("recognizes handle, channel, c and user forms", () => {
    expect(isYouTubeChannelUrl("https://www.youtube.com/@yufid")).toBe(true);
    expect(isYouTubeChannelUrl("https://youtube.com/channel/UCabcdefghijklmnopqrstuv")).toBe(true);
    expect(isYouTubeChannelUrl("https://www.youtube.com/c/SomeName")).toBe(true);
    expect(isYouTubeChannelUrl("https://www.youtube.com/user/SomeName")).toBe(true);
  });

  it("does not treat an existing feed URL or a non-YouTube URL as a channel", () => {
    expect(
      isYouTubeChannelUrl("https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv")
    ).toBe(false);
    expect(isYouTubeChannelUrl("https://example.com/feed.xml")).toBe(false);
  });

  it("rewrites a /channel/ URL without touching the network", async () => {
    await expect(
      resolveYouTubeFeedUrl("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv")
    ).resolves.toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv");
  });
});

describe("channelLookupParam", () => {
  it("maps each channel URL form to the right API lookup", () => {
    expect(channelLookupParam("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv")).toEqual({
      key: "id",
      value: "UCabcdefghijklmnopqrstuv",
    });
    expect(channelLookupParam("https://www.youtube.com/@AdiHidayatOfficial")).toEqual({
      key: "forHandle",
      value: "@AdiHidayatOfficial",
    });
    expect(channelLookupParam("https://www.youtube.com/user/LegacyName")).toEqual({
      key: "forUsername",
      value: "LegacyName",
    });
  });

  it("returns null for anything that is not a channel URL", () => {
    expect(channelLookupParam("https://example.com/feed.xml")).toBeNull();
    expect(channelLookupParam("https://www.youtube.com/watch?v=abc")).toBeNull();
  });
});
