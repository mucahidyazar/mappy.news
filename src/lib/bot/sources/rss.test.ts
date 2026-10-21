import { describe, expect, it } from "vitest";

import { parseFeed, pollFeed } from "./rss";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Örnek Haber</title>
    <link>https://ornek.example/</link>
    <item>
      <title><![CDATA[Kadıköy'de yangın &amp; tahliye]]></title>
      <link>https://ornek.example/haber/1</link>
      <guid isPermaLink="false">haber-1</guid>
      <pubDate>Tue, 21 Oct 2026 09:30:00 +0300</pubDate>
      <description><![CDATA[<p>Moda'da bir binada <b>yangın</b> çıktı.</p><img src="https://cdn.example/1.jpg">]]></description>
      <dc:creator>Muhabir Adı</dc:creator>
    </item>
    <item>
      <title>Ankara'da trafik kazası</title>
      <link>https://ornek.example/haber/2</link>
      <pubDate>Tue, 21 Oct 2026 11:00:00 +0300</pubDate>
      <description>Eskişehir yolunda kaza: 2 yaralı</description>
      <media:content url="https://cdn.example/2.jpg" medium="image" />
    </item>
    <item>
      <title></title>
      <description></description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom akışı</title>
  <entry>
    <title type="html">İzmir&apos;de sel</title>
    <link rel="self" href="https://atom.example/self/9" />
    <link rel="alternate" href="https://atom.example/haber/9" />
    <id>tag:atom.example,2026:9</id>
    <updated>2026-10-21T08:00:00Z</updated>
    <summary>Bayraklı'da sağanak sonrası evleri su bastı.</summary>
    <author><name>Atom Muhabiri</name></author>
  </entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel><title>RDF</title></channel>
  <item>
    <title>Trabzon'da heyelan</title>
    <link>https://rdf.example/1</link>
    <description>Of ilçesinde heyelan nedeniyle yol kapandı.</description>
    <dc:date>2026-10-21T07:00:00+03:00</dc:date>
  </item>
</rdf:RDF>`;

describe("parseFeed", () => {
  it("parses RSS 2.0 items newest first and skips empty ones", () => {
    const entries = parseFeed(RSS);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      externalId: "https://ornek.example/haber/2",
      url: "https://ornek.example/haber/2",
      title: "Ankara'da trafik kazası",
      media: [{ type: "image", url: "https://cdn.example/2.jpg" }],
    });
    expect(entries[1]).toMatchObject({
      externalId: "haber-1",
      title: "Kadıköy'de yangın & tahliye",
      body: "Moda'da bir binada yangın çıktı.",
      author: "Muhabir Adı",
      media: [{ type: "image", url: "https://cdn.example/1.jpg" }],
    });
    expect(entries[1]!.publishedAt?.toISOString()).toBe("2026-10-21T06:30:00.000Z");
  });

  it("parses Atom entries with the alternate link", () => {
    const [entry] = parseFeed(ATOM);
    expect(entry).toMatchObject({
      externalId: "tag:atom.example,2026:9",
      url: "https://atom.example/haber/9",
      title: "İzmir'de sel",
      body: "Bayraklı'da sağanak sonrası evleri su bastı.",
      author: "Atom Muhabiri",
    });
  });

  it("parses RSS 1.0 (RDF) documents", () => {
    const [entry] = parseFeed(RDF);
    expect(entry).toMatchObject({ url: "https://rdf.example/1", title: "Trabzon'da heyelan" });
    expect(entry!.publishedAt?.toISOString()).toBe("2026-10-21T04:00:00.000Z");
  });

  it("rejects documents that are not feeds", () => {
    expect(() => parseFeed("<html><body>Not a feed</body></html>")).toThrow(/Not an RSS or Atom feed/);
  });

  it("ignores non-http links and images", () => {
    const xml = RSS.replace("https://ornek.example/haber/2", "javascript:alert(1)").replace("https://cdn.example/2.jpg", "data:image/png;base64,AAAA");
    const entry = parseFeed(xml).find((item) => item.title === "Ankara'da trafik kazası");
    expect(entry).toMatchObject({ url: null, media: [] });
  });
});

describe("pollFeed", () => {
  const publicLookup = { resolve: async () => ["93.184.216.34"] };

  it("sends conditional headers and reports 304 as not modified", async () => {
    let headers: Headers | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      headers = new Headers(init?.headers);
      return new Response(null, { status: 304 });
    }) as typeof fetch;
    const result = await pollFeed("https://ornek.example/rss", { etag: '"abc"', lastModified: "Tue, 21 Oct 2026 08:00:00 GMT" }, { fetchImpl, ...publicLookup });
    expect(result.notModified).toBe(true);
    expect(headers?.get("if-none-match")).toBe('"abc"');
    expect(headers?.get("if-modified-since")).toBe("Tue, 21 Oct 2026 08:00:00 GMT");
  });

  it("stores the new validators and the newest item time", async () => {
    const fetchImpl = (async () =>
      new Response(RSS, { status: 200, headers: { "content-type": "application/rss+xml", etag: '"v2"', "last-modified": "Tue, 21 Oct 2026 09:00:00 GMT" } })) as typeof fetch;
    const result = await pollFeed("https://ornek.example/rss", {}, { fetchImpl, ...publicLookup });
    expect(result.entries).toHaveLength(2);
    expect(result.cursor).toMatchObject({ etag: '"v2"', lastModified: "Tue, 21 Oct 2026 09:00:00 GMT", lastItemAt: "2026-10-21T08:00:00.000Z" });
  });
});
