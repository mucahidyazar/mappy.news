import { Resend } from "resend";

import { serverEnv } from "@/lib/env";

import { type EmailContent } from "./templates";

let client: Resend | null | undefined;

function resend(): Resend | null {
  if (client !== undefined) return client;
  const key = serverEnv().RESEND_API_KEY;
  client = key ? new Resend(key) : null;
  return client;
}

/**
 * Sends a transactional email through Resend. Without RESEND_API_KEY (local development) the message is
 * printed so sign-up and password reset links stay usable.
 */
export async function sendEmail(to: string, content: EmailContent): Promise<void> {
  const provider = resend();
  if (!provider) {
    console.info(`[email] RESEND_API_KEY is not set; would send "${content.subject}" to ${to}\n${content.text}`);
    return;
  }
  const { error } = await provider.emails.send({
    from: serverEnv().EMAIL_FROM,
    to,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });
  if (error) {
    throw new Error(`Email delivery failed: ${error.name}: ${error.message}`);
  }
}
