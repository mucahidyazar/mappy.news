/** Reputation ranks earned with points. Names are translated under `ranks.<key>`. */
export const RANKS = [
  { key: "observer", minPoints: 0, icon: "👀", color: "#94a3b8" },
  { key: "neighborhood_reporter", minPoints: 100, icon: "📝", color: "#60a5fa" },
  { key: "local_detective", minPoints: 500, icon: "🔍", color: "#a78bfa" },
  { key: "district_envoy", minPoints: 1_500, icon: "📡", color: "#34d399" },
  { key: "city_correspondent", minPoints: 5_000, icon: "🏙️", color: "#fbbf24" },
  { key: "regional_bureau", minPoints: 15_000, icon: "🗞️", color: "#f97316" },
  { key: "national_hero", minPoints: 50_000, icon: "🏅", color: "#ef4444" },
] as const;

export type Rank = (typeof RANKS)[number];
export type RankKey = Rank["key"];

export function rankFor(points: number): Rank {
  let current: Rank = RANKS[0];
  for (const rank of RANKS) if (points >= rank.minPoints) current = rank;
  return current;
}

/** The next rank and how far along the user is towards it (0–1); null at the top rank. */
export function rankProgress(points: number): { next: Rank; progress: number; remaining: number } | null {
  const current = rankFor(points);
  const index = RANKS.findIndex((rank) => rank.key === current.key);
  const next = RANKS[index + 1];
  if (!next) return null;
  const span = next.minPoints - current.minPoints;
  return {
    next,
    progress: Math.min(1, Math.max(0, (points - current.minPoints) / span)),
    remaining: next.minPoints - points,
  };
}
