import { describe, expect, it } from "vitest";

import { extractArticleText, fetchArticleText } from "./article";

const long = "Zonguldak'ın Kilimli ilçesi Çatalağzı Mahallesi'nde 3 katlı bir bina sabah saatlerinde çöktü. ".repeat(4);

describe("extractArticleText", () => {
  it("prefers the publisher's NewsArticle JSON-LD, also inside @graph", () => {
    const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"NewsArticle","articleBody":"<p>${long}</p>"}]}</script></head><body><p>Menü bağlantıları ve reklam metni burada yer alıyor, haberle ilgisi yok.</p></body></html>`;
    expect(extractArticleText(html)).toBe(long.trim());
  });

  it("falls back to the paragraphs of <article> and skips short boilerplate", () => {
    const html = `<html><body><nav><p>Anasayfa · Gündem · Spor · Ekonomi ve diğer bütün kategoriler burada listeleniyor</p></nav>
      <script type="application/ld+json">{ broken json</script>
      <article><h1>Başlık</h1><p>Paylaş</p><p>${long}</p><p>Olay yerine itfaiye, sağlık ve AFAD ekipleri sevk edildi; arama kurtarma çalışmaları sürüyor.</p></article></body></html>`;
    const text = extractArticleText(html);
    expect(text).toContain("Çatalağzı Mahallesi");
    expect(text).toContain("AFAD ekipleri");
    expect(text).not.toContain("Paylaş");
    expect(text).not.toContain("Anasayfa");
  });

  it("returns null for pages without article text", () => {
    expect(extractArticleText("<html><body><p>Kısa</p></body></html>")).toBeNull();
  });
});

describe("fetchArticleText", () => {
  const resolve = async () => ["93.184.216.34"];

  it("reads HTML pages and ignores errors and other content", async () => {
    const page = (async () => new Response(`<article><p>${long}</p></article>`, { headers: { "content-type": "text/html; charset=utf-8" } })) as typeof fetch;
    expect(await fetchArticleText("https://news.example/1", { fetchImpl: page, resolve })).toContain("Kilimli");
    const blocked = (async () => new Response("Forbidden", { status: 403, headers: { "content-type": "text/html" } })) as typeof fetch;
    expect(await fetchArticleText("https://news.example/1", { fetchImpl: blocked, resolve })).toBeNull();
    const pdf = (async () => new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } })) as typeof fetch;
    expect(await fetchArticleText("https://news.example/1", { fetchImpl: pdf, resolve })).toBeNull();
    expect(await fetchArticleText("http://127.0.0.1/admin")).toBeNull();
  });
});
