import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { safeNext } from "@/components/auth/safe-next";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signUpTitle"), robots: { index: false } };
}

export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next } = await searchParams;
  const destination = safeNext(next, localizedPath("/", locale as Locale));
  if (await getCurrentUser()) redirect(destination);

  const t = await getTranslations("auth");
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <AuthCard
      title={t("signUpTitle")}
      description={t("signUpDescription")}
      footer={
        <span>
          {t("haveAccount")}{" "}
          <Link href={{ pathname: "/sign-in", query: next ? { next } : undefined }} className="font-medium text-foreground underline-offset-4 hover:underline">
            {t("signIn")}
          </Link>
        </span>
      }
    >
      <SignUpForm next={destination} googleEnabled={googleEnabled} />
    </AuthCard>
  );
}
