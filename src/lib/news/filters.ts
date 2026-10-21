import { z } from "zod";

export const TIME_RANGES = ["24h", "7d", "30d", "90d", "custom"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];
export const DEFAULT_RANGE: TimeRange = "7d";

const RANGE_HOURS: Record<Exclude<TimeRange, "custom">, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
};

/** Longest window a single request may cover. */
export const MAX_RANGE_DAYS = 366;

export function resolveRange(range: TimeRange, from?: string | null, to?: string | null, now = new Date()) {
  if (range === "custom" && from) {
    const start = new Date(`${from}T00:00:00+03:00`);
    const end = to ? new Date(`${to}T23:59:59.999+03:00`) : now;
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
      const maxStart = new Date(end.getTime() - MAX_RANGE_DAYS * 24 * 3600 * 1000);
      return { from: start < maxStart ? maxStart : start, to: end };
    }
  }
  const preset = (range === "custom" ? DEFAULT_RANGE : range) as Exclude<TimeRange, "custom">;
  const hours = RANGE_HOURS[preset];
  return { from: new Date(now.getTime() - hours * 3600 * 1000), to: now };
}

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => /^[a-z0-9_]{2,40}$/.test(item))
      .slice(0, 20),
  );

const bbox = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    const parts = value.split(",").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return undefined;
    const [west, south, east, north] = parts as [number, number, number, number];
    if (west >= east || south >= north) return undefined;
    return { west, south, east, north };
  });

/** Query string of GET /api/news/map. */
export const mapQuerySchema = z.object({
  range: z.enum(TIME_RANGES).catch(DEFAULT_RANGE).default(DEFAULT_RANGE),
  from: dateOnly,
  to: dateOnly,
  c: csv,
  q: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => value || undefined),
  bbox,
  source: z.string().uuid().optional().catch(undefined),
});

export type MapQuery = z.infer<typeof mapQuerySchema>;
