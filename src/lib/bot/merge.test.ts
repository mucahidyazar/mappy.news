import { describe, expect, it } from "vitest";

import type { DedupeCandidate } from "./dedupe";
import { buildMergePrompt, candidateKey, type MergeSubject, normalizeMergeDecision } from "./merge";

const subject: MergeSubject = {
  title: "Moda'daki yangında ölü sayısı 2'ye yükseldi",
  summary: "Kadıköy Moda'da 4 katlı binada çıkan yangında ağır yaralanan bir kişi daha hayatını kaybetti.",
  content: null,
  categoryKey: "fire_explosion",
  occurredAt: new Date("2026-10-24T09:30:00Z"),
  locationLabel: "Caferağa Mahallesi, Kadıköy, İstanbul",
  casualties: { deaths: 2, injured: 3 },
};

function candidate(overrides: Partial<DedupeCandidate> = {}): DedupeCandidate {
  return {
    id: "story-1",
    parentId: null,
    title: "Kadıköy Moda'da binada yangın",
    summary: "Moda'da 4 katlı bir binada yangın çıktı; 1 kişi hayatını kaybetti.",
    categoryKey: "fire_explosion",
    occurredAt: new Date("2026-10-24T06:00:00Z"),
    latitude: 40.98,
    longitude: 29.03,
    province: "İstanbul",
    district: "Kadıköy",
    urls: [],
    status: "published",
    locationLabel: "Caferağa Mahallesi, Kadıköy, İstanbul",
    deaths: 1,
    injured: null,
    ...overrides,
  };
}

describe("buildMergePrompt", () => {
  it("lists the similar stories by letter with what tells incidents apart", () => {
    const { prompt } = buildMergePrompt(subject, [candidate(), candidate({ id: "story-2", parentId: "story-0", title: "Bahariye'de kaza", status: "pending", deaths: null })]);
    expect(prompt).toContain("YENİ HABER");
    expect(prompt).toContain("Kayıplar: 2 ölü, 3 yaralı");
    expect(prompt).toContain("[A] Başlık: Kadıköy Moda'da binada yangın");
    expect(prompt).toContain("Kayıplar: 1 ölü");
    expect(prompt).toContain("[B] Başlık: Bahariye'de kaza");
    expect(prompt).toContain("Durum: incelemede, daha önceki bir haberin güncellemesi");
    expect(prompt).toContain("Kayıplar: belirtilmemiş");
    // Times are shown as Turkish readers know them.
    expect(prompt).toContain("Olay zamanı: 24 Eki 2026 12:30");
  });
});

describe("normalizeMergeDecision", () => {
  const candidates = [candidate(), candidate({ id: "story-2" })];

  it("maps the letter back to the story", () => {
    expect(candidateKey(1)).toBe("B");
    expect(normalizeMergeDecision({ action: "update", target: " b ", confidence: 0.9, reason: "Aynı yangın, ölü sayısı arttı." }, candidates)).toMatchObject({
      action: "update",
      target: { id: "story-2" },
      confidence: 0.9,
      reason: "Aynı yangın, ölü sayısı arttı.",
    });
  });

  it("treats a verdict about a story that isn't listed as a new incident", () => {
    expect(normalizeMergeDecision({ action: "duplicate", target: "D", confidence: 0.95, reason: null }, candidates)).toMatchObject({ action: "new", target: null, confidence: 0 });
    expect(normalizeMergeDecision({ action: "duplicate", target: null, confidence: 0.95, reason: null }, candidates).action).toBe("new");
  });

  it("bounds the confidence and keeps a new verdict's own", () => {
    expect(normalizeMergeDecision({ action: "duplicate", target: "A", confidence: 1.7, reason: "Aynı" }, candidates).confidence).toBe(1);
    expect(normalizeMergeDecision({ action: "duplicate", target: "A", confidence: null, reason: "Aynı" }, candidates).confidence).toBe(0);
    expect(normalizeMergeDecision({ action: "new", target: "A", confidence: 0.8, reason: "Başka olay" }, candidates)).toMatchObject({ action: "new", target: null, confidence: 0.8 });
  });
});
