/**
 * Grants a role to an existing account:  pnpm make-admin someone@example.com [admin|moderator|user]
 */
import "./load-env";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/lib/db/schema";
import { USER_ROLES } from "../src/lib/domain/constants";

async function main() {
  const [email, role = "admin"] = process.argv.slice(2);
  if (!email) throw new Error("Usage: pnpm make-admin <email> [admin|moderator|user]");
  if (!(USER_ROLES as readonly string[]).includes(role)) throw new Error(`Role must be one of ${USER_ROLES.join(", ")}`);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema, casing: "snake_case" });
    const updated = await db
      .update(schema.user)
      .set({ role })
      .where(eq(schema.user.email, email.toLowerCase()))
      .returning({ id: schema.user.id });
    if (updated.length === 0) throw new Error(`No account with email ${email}; sign up first.`);
    // Role changes apply to new sessions; sign out and back in to pick it up immediately.
    console.log(`[make-admin] ${email} is now ${role}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("[make-admin]", error instanceof Error ? error.message : error);
  process.exit(1);
});
