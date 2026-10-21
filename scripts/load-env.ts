// Loads .env files the same way Next.js does. @next/env is CommonJS, so it is imported as a default export.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
