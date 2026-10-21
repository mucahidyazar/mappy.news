import { describe, expect, it } from "vitest";

import { foldTurkish, newsSlug, searchText, similarity, slugify, stripHtml, tokenize, truncate } from "./text";

describe("foldTurkish", () => {
  it("lowercases with Turkish rules and removes diacritics", () => {
    expect(foldTurkish("İSTANBUL Kadıköy Üsküdar Çağlayan Şişli Iğdır")).toBe("istanbul kadikoy uskudar caglayan sisli igdir");
  });
});

describe("slugify", () => {
  it("builds ASCII slugs from Turkish titles", () => {
    expect(slugify("Kadıköy'de 3 katlı binada yangın!")).toBe("kadikoyde-3-katli-binada-yangin");
  });

  it("cuts long slugs on a word boundary", () => {
    const slug = slugify("çok uzun bir başlık ".repeat(10), 30);
    expect(slug.length).toBeLessThanOrEqual(30);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("haber");
  });

  it("adds a random suffix for news slugs", () => {
    expect(newsSlug("Ankara'da kaza")).toMatch(/^ankarada-kaza-[0-9a-z]{6}$/);
  });
});

describe("stripHtml", () => {
  it("removes tags, scripts and entities from feed descriptions", () => {
    const html = '<img src="x.jpg"/><p>Kaza &amp; yaralı</p><script>alert(1)</script><br>Detay&nbsp;var';
    expect(stripHtml(html)).toBe("Kaza & yaralı Detay var");
  });
});

describe("truncate", () => {
  it("keeps short values and cuts long ones with an ellipsis", () => {
    expect(truncate("kısa", 10)).toBe("kısa");
    expect(truncate("bir iki üç dört beş altı", 12)).toBe("bir iki üç…");
  });
});

describe("similarity", () => {
  it("scores reworded reports of the same incident high", () => {
    const a = "Kadıköy'de 5 katlı binada yangın çıktı, 2 kişi yaralandı";
    const b = "Kadıköy'deki binada çıkan yangında 2 kişi yaralandı";
    expect(similarity(a, b)).toBeGreaterThan(0.3);
  });

  it("scores unrelated incidents low", () => {
    expect(similarity("Bursa'da trafik kazası: 1 ölü", "İzmir'de dolandırıcılık operasyonu")).toBeLessThan(0.1);
  });

  it("ignores stop words when tokenizing", () => {
    expect(tokenize("Son dakika: İstanbul ve Ankara")).toEqual(["istanbul", "ankara"]);
  });
});

describe("searchText", () => {
  it("joins and folds the searchable parts", () => {
    expect(searchText("Şişli'de Kaza", null, "İstanbul")).toBe("sisli'de kaza istanbul");
  });
});

describe("decodeEntities via stripHtml", () => {
  it("decodes numeric entities and leaves invalid code points alone", () => {
    expect(stripHtml("Kad&#305;k&#xF6;y &#99999999; &#0; &bogus;")).toBe("Kadıköy &#99999999; &#0; &bogus;");
  });
});
