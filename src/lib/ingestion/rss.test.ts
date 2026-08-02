import { describe, expect, it } from "vitest";
import { parseFeedXml } from "@/lib/ingestion/rss";

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
