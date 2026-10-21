import { describe, expect, it } from "vitest";

import { screenEntry } from "./screen";

const now = new Date("2026-10-21T12:00:00Z");

function screen(body: string, overrides: Partial<Parameters<typeof screenEntry>[0]> = {}) {
  return screenEntry({
    title: null,
    body,
    publishedAt: new Date("2026-10-21T10:00:00Z"),
    trust: "media",
    keywordFilter: [],
    maxAgeHours: 48,
    keywordPrefilter: true,
    now,
    ...overrides,
  });
}

describe("screenEntry", () => {
  it("passes local incidents with suffixed Turkish words", () => {
    expect(screen("Kadıköy'de iki otomobilin çarpıştığı kazada 3 kişi yaralandı")).toMatchObject({ pass: true });
    expect(screen("Bursa'da bir fabrikada çıkan yangında işçiler tahliye edildi")).toMatchObject({ pass: true, matched: "yangin" });
    expect(screen("Elazığ'da 4,1 büyüklüğünde deprem meydana geldi, hasar yok")).toMatchObject({ pass: true, matched: "deprem" });
  });

  it("does not mistake everyday words for incident stems", () => {
    for (const body of [
      "Belediye başkanı seçimi yeniden kazandı ve törene katıldı",
      "Bu hafta sonu çok güzel bir konser oldu, katılım yüksekti",
      "Alevi dernekleri ile görüşen bakan olumlu sonuç aldığını söyledi",
      "Yıldırım ilçesinde yeni park hizmete açıldı, esrarengiz bir heykel konuldu",
    ]) {
      expect(screen(body)).toEqual({ pass: false, reason: "no_keywords" });
    }
  });

  it("keeps exact-word stems from matching longer words", () => {
    expect(screen("Otoyolda devrilen tır nedeniyle trafik durdu")).toMatchObject({ pass: true });
    expect(screen("Tiyatroda yeni sezonun ilk oyunu sahnelendi ve tirat alkışlandı")).toEqual({ pass: false, reason: "no_keywords" });
  });

  it("matches phrases that start at a word", () => {
    expect(screen("Gece saatlerinde ilçe merkezine yıldırım düştü, elektrikler kesildi")).toMatchObject({ pass: true, matched: "yildirim dus" });
  });

  it("drops old and very short entries before anything else", () => {
    expect(screen("Kazada 2 kişi yaralandı ve hastaneye kaldırıldı", { publishedAt: new Date("2026-10-18T12:00:00Z") })).toEqual({ pass: false, reason: "too_old" });
    expect(screen("Kaza var")).toEqual({ pass: false, reason: "too_short" });
  });

  it("never sends blocked topics to the model, even from official sources", () => {
    expect(screen("Köprüde intihar girişiminde bulunan kişi ikna edildi", { trust: "official" })).toMatchObject({ pass: false, reason: "blocked_topic" });
  });

  it("lets official sources skip the keyword prefilter", () => {
    expect(screen("Valilik açıklaması: ilçemizde yaşanan olayla ilgili çalışmalar sürüyor", { trust: "official" })).toEqual({ pass: true });
    expect(screen("Valilik açıklaması: ilçemizde yaşanan olayla ilgili çalışmalar sürüyor", { keywordPrefilter: false })).toEqual({ pass: true });
  });

  it("applies a source keyword filter with Turkish folding", () => {
    const filter = ["Üsküdar", "Beykoz"];
    expect(screen("Üsküdar'da trafik kazası: 1 yaralı var", { keywordFilter: filter })).toMatchObject({ pass: true });
    expect(screen("Kadıköy'de trafik kazası: 1 yaralı var", { keywordFilter: filter })).toEqual({ pass: false, reason: "keyword_filter" });
  });
});
