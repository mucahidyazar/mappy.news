import { Bot, Building2, CheckCheck, Filter, MapPinned, Megaphone, Newspaper, PhoneCall, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Page, PageIntro, Panel } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("title"), description: t("lead") };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");

  const sources = [
    { icon: Newspaper, title: t("sources.media.title"), text: t("sources.media.text") },
    { icon: Building2, title: t("sources.official.title"), text: t("sources.official.text") },
    { icon: Megaphone, title: t("sources.readers.title"), text: t("sources.readers.text") },
  ];
  const steps = [
    { icon: Filter, title: t("steps.collect.title"), text: t("steps.collect.text") },
    { icon: Sparkles, title: t("steps.analyse.title"), text: t("steps.analyse.text") },
    { icon: MapPinned, title: t("steps.locate.title"), text: t("steps.locate.text") },
    { icon: CheckCheck, title: t("steps.dedupe.title"), text: t("steps.dedupe.text") },
    { icon: ShieldCheck, title: t("steps.review.title"), text: t("steps.review.text") },
  ];

  return (
    <Page>
      <PageIntro
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("lead")}
        actions={
          <>
            <Button asChild>
              <Link href="/">{t("openMap")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/leaderboard">{t("seeLeaderboard")}</Link>
            </Button>
          </>
        }
      />

      <section className="space-y-5">
        <h2 className="text-2xl font-semibold tracking-tight">{t("sourcesTitle")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {sources.map(({ icon: Icon, title, text }) => (
            <Panel key={title}>
              <Icon className="size-5 text-primary" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </Panel>
          ))}
        </div>
      </section>

      <section className="mt-12 space-y-5">
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Bot className="size-6" /> {t("stepsTitle")}
        </h2>
        <ol className="grid gap-4 md:grid-cols-5">
          {steps.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="relative rounded-2xl border bg-card p-5">
              <span className="text-xs font-semibold text-muted-foreground">0{index + 1}</span>
              <Icon className="mt-2 size-5 text-primary" />
              <h3 className="mt-2 text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 grid gap-5 md:grid-cols-2">
        <Panel>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MapPinned className="size-5" /> {t("precisionTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("precisionText")}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("privacyText")}</p>
        </Panel>
        <Panel>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Trophy className="size-5" /> {t("communityTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("communityText")}</p>
        </Panel>
      </section>

      <section className="mt-10 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <PhoneCall className="mt-0.5 size-5 shrink-0 text-destructive" />
        <p className="text-sm leading-relaxed">{t("emergency")}</p>
      </section>
    </Page>
  );
}
