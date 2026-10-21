import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { safeNext } from "@/components/auth/safe-next";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/site";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signInTitle"), robots: { index: false } };
}

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, error } = await searchParams;
  const destination = safeNext(next, localizedPath("/", locale as Locale));
  if (await getCurrentUser()) redirect(destination);

  const t = await getTranslations("auth");
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <AuthCard
      title={t("signInTitle")}
      description={t("signInDescription")}
      footer={
        <span>
          {t("noAccount")}{" "}
          <Link href={{ pathname: "/sign-up", query: next ? { next } : undefined }} className="font-medium text-foreground underline-offset-4 hover:underline">
            {t("signUp")}
          </Link>
        </span>
      }
    >
      <SignInForm next={destination} googleEnabled={googleEnabled} initialError={error} />
    </AuthCard>
  );
}
