import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("resetTitle"), robots: { index: false } };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token, error } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("resetTitle")} description={t("resetDescription")}>
      <ResetPasswordForm token={error ? null : (token ?? null)} />
    </AuthCard>
  );
}
