import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { LegalPage } from "@/components/legal/legal-page";
import { getLegalDocument } from "@/content/legal";
import { isLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const document = getLegalDocument("privacy", isLocale(locale) ? locale : "tr");
  return { title: document.title, description: document.description };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <LegalPage
      document={getLegalDocument("privacy", isLocale(locale) ? locale : "tr")}
      contactEmail={process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined}
    />
  );
}
