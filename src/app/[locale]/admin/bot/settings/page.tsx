import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BotSettingsForm } from "@/components/admin/bot/settings-form";
import { PageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/session";
import { aiKeysFromEnv, configuredProviders } from "@/lib/bot/ai";
import { readBotSettings } from "@/lib/bot/settings";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.botSettings" });
  return { title: t("title") };
}

export default async function BotSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("bot.manage");
  const t = await getTranslations("admin.botSettings");
  const settings = await readBotSettings(db);
  return (
    <div>
      <PageHeader title={t("title")} description={t("description")} />
      <BotSettingsForm initial={settings} providers={configuredProviders(aiKeysFromEnv())} xConfigured={Boolean(process.env.X_BEARER_TOKEN)} />
    </div>
  );
}
