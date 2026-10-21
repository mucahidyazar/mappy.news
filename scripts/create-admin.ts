/**
 * Creates (or updates) a verified email/password account with a staff role. The password is read from the
 * ADMIN_PASSWORD environment variable so it never ends up in the repository:
 *
 *   ADMIN_PASSWORD='…' pnpm create-admin you@example.com [--name "Ad Soyad"] [--role admin|moderator]
 */
import "./load-env";

import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/lib/db/schema";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const role = argument("role") ?? "admin";
  if (!email || !email.includes("@")) throw new Error("Usage: ADMIN_PASSWORD='…' pnpm create-admin <email> [--name \"…\"] [--role admin|moderator]");
  if (password.length < 8 || password.length > 128) throw new Error("ADMIN_PASSWORD must be 8–128 characters");
  if (!["admin", "moderator"].includes(role)) throw new Error("--role must be admin or moderator");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });
  const { account, user, userProfiles } = schema;

  try {
    const hash = await hashPassword(password);
    const created = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
      const userId = existing?.id ?? randomUUID().replace(/-/g, "");
      const name = argument("name") ?? email.split("@")[0]!;
      if (existing) {
        await tx
          .update(user)
          .set({ role, emailVerified: true, banned: false, banReason: null, banExpires: null, ...(argument("name") ? { name } : {}) })
          .where(eq(user.id, userId));
      } else {
        await tx.insert(user).values({ id: userId, name, email, emailVerified: true, role });
      }

      const [credential] = await tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
        .limit(1);
      if (credential) {
        await tx.update(account).set({ password: hash }).where(eq(account.id, credential.id));
      } else {
        await tx.insert(account).values({ id: randomUUID().replace(/-/g, ""), accountId: userId, providerId: "credential", userId, password: hash });
      }
      await tx.insert(userProfiles).values({ userId }).onConflictDoNothing();
      return !existing;
    });
    console.log(`[create-admin] ${created ? "created" : "updated"} ${email} as ${role}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("[create-admin]", error instanceof Error ? error.message : error);
  process.exit(1);
});
