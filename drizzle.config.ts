import * as nextEnv from "@next/env";
import { defineConfig } from "drizzle-kit";

// @next/env is CommonJS: depending on the loader its exports sit on the namespace or on `default`.
const { loadEnvConfig } = (nextEnv as unknown as { default?: typeof nextEnv }).default ?? nextEnv;
loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/mappy_news",
  },
  strict: true,
  verbose: true,
});
