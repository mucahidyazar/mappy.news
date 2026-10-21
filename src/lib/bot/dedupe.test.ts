import { describe, expect, it } from "vitest";

import { decideDedupe, type DedupeCandidate, type DedupeSubject, scoreCandidate } from "./dedupe";

const subject: DedupeSubject = {
  title: "Kadıköy Moda'da 4 katlı binada yangın çıktı",
  summary: "Moda Caddesi'ndeki binada çıkan yangında 2 kişi dumandan etkilendi.",
  url: "https://ornek.example/haber/1",
  categoryKey: "fire",
  occurredAt: new Date("2026-10-21T09:00:00Z"),
  latitude: 40.982,
  longitude: 29.026,
  province: "İstanbul",
  district: "Kadıköy",
};

function candidate(overrides: Partial<DedupeCandidate> = {}): DedupeCandidate {
  return {
    id: "story-1",
    parentId: null,
    title: "Kadıköy Moda'da binada yangın",
    summary: "Moda'daki 4 katlı binada yangın çıktı, 2 kişi dumandan etkilendi.",
    categoryKey: "fire",
    occurredAt: new Date("2026-10-21T08:30:00Z"),
    latitude: 40.983,
    longitude: 29.025,
    province: "İstanbul",
    district: "Kadıköy",
    urls: [],
    ...overrides,
  };
}

describe("scoreCandidate", () => {
  it("scores the same incident high and an unrelated one low", () => {
    expect(scoreCandidate(subject, candidate()).score).toBeGreaterThanOrEqual(0.6);
    const unrelated = candidate({ title: "Ankara'da trafik kazası", summary: "Eskişehir yolunda iki araç çarpıştı.", categoryKey: "traffic_accident", latitude: 39.9, longitude: 32.8, district: "Çankaya", province: "Ankara", occurredAt: new Date("2026-10-15T08:00:00Z") });
    expect(scoreCandidate(subject, unrelated).score).toBeLessThan(0.2);
  });
});

describe("decideDedupe", () => {
  it("treats a known URL as a duplicate", () => {
    const decision = decideDedupe(subject, [candidate({ title: "Başka başlık", summary: null, urls: [subject.url!] })]);
    expect(decision).toMatchObject({ kind: "duplicate", reason: "same_url", score: 1 });
  });

  it("merges the same incident into the existing story", () => {
    expect(decideDedupe(subject, [candidate()])).toMatchObject({ kind: "duplicate", reason: "same_incident", target: { id: "story-1" } });
  });

  it("suggests a parent for related reports in another category", () => {
    const decision = decideDedupe(subject, [candidate({ categoryKey: "other_incidents" })]);
    expect(decision.kind).toBe("follow_up");
  });

  it("keeps new incidents separate", () => {
    expect(decideDedupe(subject, [])).toMatchObject({ kind: "new", reason: "no_candidates" });
    const elsewhere = candidate({ title: "Bornova'da depo yangını", summary: "Sanayi sitesindeki depoda yangın çıktı.", latitude: 38.46, longitude: 27.22, district: "Bornova", province: "İzmir" });
    expect(decideDedupe(subject, [elsewhere]).kind).toBe("new");
  });
});
