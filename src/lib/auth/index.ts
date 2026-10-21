import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";

import { db } from "@/lib/db";
import { account, session, user, userProfiles, verification } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { resetPasswordEmail, verificationEmail } from "@/lib/email/templates";
import { appUrl, serverEnv } from "@/lib/env";
import { localeFromRequest } from "@/lib/i18n-server";

function createAuth() {
  const env = serverEnv();
  const adminEmails = new Set(env.ADMIN_EMAILS.map((email) => email.toLowerCase()));
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: "select_account" as const } }
      : {};

  return betterAuth({
    appName: "mappy.news",
    baseURL: appUrl(),
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [appUrl()],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user: target, url }, request) => {
        await sendEmail(target.email, resetPasswordEmail(localeFromRequest(request), url));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user: target, url }, request) => {
        await sendEmail(target.email, verificationEmail(localeFromRequest(request), url));
      },
    },
    socialProviders: google,
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    user: {
      deleteUser: { enabled: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    rateLimit: {
      enabled: env.NODE_ENV === "production",
      window: 60,
      max: 120,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60 * 60, max: 6 },
        "/request-password-reset": { window: 60 * 60, max: 5 },
        "/send-verification-email": { window: 60 * 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: "mappy",
    },
    databaseHooks: {
      user: {
        create: {
          before: async (candidate) => {
            if (!adminEmails.has(candidate.email.toLowerCase())) return;
            return { data: { ...candidate, role: "admin" } };
          },
          after: async (created) => {
            await db.insert(userProfiles).values({ userId: created.id }).onConflictDoNothing();
          },
        },
      },
    },
    plugins: [
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
      // Must stay last: lets server actions set auth cookies.
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __mappyAuth?: Auth };

/** Built on first use so the environment is only read at runtime. */
export function getAuth(): Auth {
  if (!globalForAuth.__mappyAuth) globalForAuth.__mappyAuth = createAuth();
  return globalForAuth.__mappyAuth;
}

export type AuthSession = Auth["$Infer"]["Session"];
