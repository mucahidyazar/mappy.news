import { z } from "zod";

/** Empty strings in .env files mean "not set". */
const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  APP_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  ADMIN_EMAILS: csv,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: z.string().default("mappy.news <noreply@mappy.news>"),
  GOOGLE_GENERATIVE_AI_API_KEY: optionalString,
  GEMINI_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  DEEPSEEK_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  XAI_API_KEY: optionalString,
  X_BEARER_TOKEN: optionalString,
  CRON_SECRET: optionalString,
  NOMINATIM_URL: z.string().url().default("https://nominatim.openstreetmap.org"),
  /** Photon (named places); an empty string switches it off. */
  PHOTON_URL: z.string().default("https://photon.komoot.io"),
  /** Overpass (exact junction nodes): only a self-hosted instance, the public one asks bots to run their own. */
  OVERPASS_URL: z.string().default(""),
  /** Self-hosted geocoders: no request spacing. */
  GEOCODER_FAST: z.stringbool().default(false),
  GEOCODER_CONTACT_EMAIL: optionalString,
  WORKER_ALIVE_FILE: optionalString,
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/** Parsed lazily so `next build` and tests can import modules without a full environment. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = process.env.NODE_ENV === "production";

/** Public base URL without a trailing slash. Available on the client through NEXT_PUBLIC_APP_URL. */
export function appUrl(): string {
  const value = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return value.replace(/\/+$/, "");
}
