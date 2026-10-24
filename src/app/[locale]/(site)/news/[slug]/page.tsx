import { ArrowLeft, Bot, CalendarClock, Eye, Layers, LifeBuoy, MessageCircle, ShieldAlert, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { cache } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import { Page, Panel } from "@/components/layout/container";
import { CasualtyStats } from "@/components/news/casualties";
import { CommentsSection } from "@/components/news/comments-section";
import { LocationLabel } from "@/components/news/location-label";
import { MiniMap } from "@/components/news/mini-map";
import { RelativeTime } from "@/components/news/relative-time";
import { ShareButtons, ViewPing } from "@/components/news/share-buttons";
import { VerifyLocationDialog } from "@/components/news/verify-location-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { isStaff } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { categoryName, hostLabel, newsPath } from "@/lib/news/format";
import { absoluteUrl, SITE_NAME, siteUrl } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getNewsBySlug, listNearbyNews } from "@/server/news/public";

export const dynamic = "force-dynamic";

const loadStory = cache(async (slug: string) => {
  const viewer = await getCurrentUser();
  const story = await getNewsBySlug(slug, { includeUnpublished: Boolean(viewer && isStaff(viewer.role)) });
  return story;
});

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const story = await loadStory(slug).catch(() => null);
  if (!story) return {};
  const path = newsPath(story.slug);
  return {
    title: story.title,
    description: story.summary ?? undefined,
    alternates: {
      canonical: absoluteUrl(path, locale as Locale),
      languages: { tr: absoluteUrl(path, "tr"), en: absoluteUrl(path, "en") },
    },
    openGraph: {
      type: "article",
      title: story.title,
      description: story.summary ?? undefined,
      publishedTime: story.publishedAt ?? undefined,
      modifiedTime: story.updatedAt,
      section: categoryName(story.category, locale),
      url: absoluteUrl(path, locale as Locale),
    },
    twitter: { card: "summary_large_image", title: story.title, description: story.summary ?? undefined },
    robots: story.status === "published" ? undefined : { index: false, follow: false },
  };
}

function paragraphs(text: string | null) {
  return (text ?? "")
    .split(/\n{2,}|\r\n\r\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default async function NewsPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const story = await loadStory(slug);
  if (!story) notFound();

  const t = await getTranslations("story");
  const format = await getFormatter();
  const nearby = await listNearbyNews(story).catch(() => []);
  const url = absoluteUrl(newsPath(story.slug), locale as Locale);
  const body = paragraphs(story.content);
  const showSummary = story.summary && !(story.content ?? "").trim().startsWith(story.summary.slice(0, 60));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: story.title,
    description: story.summary ?? undefined,
    datePublished: story.publishedAt ?? story.occurredAt,
    dateModified: story.updatedAt,
    inLanguage: "tr-TR",
    mainEntityOfPage: url,
    image: [story.imageUrl ?? `${url}/opengraph-image`],
    articleSection: story.category.nameTr,
    author: { "@type": "Organization", name: SITE_NAME, url: siteUrl() },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${siteUrl()}/brand/web-app-manifest-512x512.png` },
    },
    contentLocation:
      story.latitude != null && story.longitude != null
        ? {
            "@type": "Place",
            name: story.locationLabel,
            geo: { "@type": "GeoCoordinates", latitude: story.latitude, longitude: story.longitude },
          }
        : { "@type": "Place", name: story.locationLabel },
    isBasedOn: story.citations.map((citation) => citation.url),
  };

  return (
    <Page>
      <ViewPing newsId={story.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4 gap-1.5 text-muted-foreground">
        <Link href="/">
          <ArrowLeft className="size-4" /> {t("backToMap")}
        </Link>
      </Button>

      {story.status !== "published" ? (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          {t("previewNotice", { status: t(`status.${story.status}`) })}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="min-w-0">
          <header className="space-y-4">
            <Link
              href={{ pathname: "/", query: { c: story.category.key } }}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: story.category.color }}
            >
              <CategoryIcon icon={story.category.icon} className="size-3.5" />
              {categoryName(story.category, locale)}
            </Link>
            <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance sm:text-3xl md:text-4xl">{story.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-4" />
                <RelativeTime value={story.occurredAt} />
                <span className="hidden sm:inline">· {format.dateTime(new Date(story.occurredAt), { dateStyle: "medium", timeStyle: "short" })}</span>
              </span>
              <LocationLabel label={story.locationLabel} precision={story.precision} />
              <span className="inline-flex items-center gap-1">
                <Eye className="size-4" /> {format.number(story.viewCount)}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="size-4" /> {story.commentCount}
              </span>
            </div>
            <CasualtyStats {...story.casualties} className="pt-1" />
          </header>

          {story.imageUrl ? (
            // External publisher image, shown without the optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={story.imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="mt-6 aspect-video w-full rounded-2xl bg-muted object-cover"
            />
          ) : null}

          <div className="mt-6 space-y-4 text-[17px] leading-relaxed">
            {showSummary ? <p className="text-lg font-medium text-foreground/90">{story.summary}</p> : null}
            {body.map((paragraph, index) => (
              <p key={index} className="text-foreground/85">
                {paragraph}
              </p>
            ))}
          </div>

          {story.category.key === "suicide" ? (
            // Reporting guidelines on suicide: always point to help.
            <aside className="mt-6 flex items-start gap-3 rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed">
              <LifeBuoy className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p>{t("suicideHelp")}</p>
            </aside>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y py-4">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              {story.origin === "bot" ? <Bot className="mt-0.5 size-4 shrink-0" /> : <UserRound className="mt-0.5 size-4 shrink-0" />}
              <span>
                {story.origin === "bot"
                  ? story.autoPublished
                    ? t("origin.botAuto")
                    : t("origin.bot")
                  : story.origin === "user"
                    ? t("origin.user", { name: story.submittedBy?.name ?? t("anonymous") })
                    : t("origin.admin")}
              </span>
            </p>
            <ShareButtons title={story.title} url={url} />
          </div>

          {story.timeline.length > 1 ? (
            <section className="mt-8 space-y-3" aria-labelledby="timeline-title">
              <h2 id="timeline-title" className="text-lg font-semibold">
                {t("timeline")}
              </h2>
              <ol className="relative space-y-4 border-l pl-5">
                {story.timeline.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span
                      className={cn(
                        "absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-background",
                        entry.isCurrent ? "bg-primary" : "bg-muted-foreground/50",
                      )}
                    />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <RelativeTime value={entry.occurredAt} />
                      {entry.relation ? <Badge variant="secondary">{t(`relation.${entry.relation}`)}</Badge> : <Badge variant="outline">{t("firstReport")}</Badge>}
                    </div>
                    {entry.isCurrent ? (
                      <p className="mt-1 text-sm font-medium">{entry.title}</p>
                    ) : (
                      <Link href={newsPath(entry.slug)} className="mt-1 block text-sm font-medium hover:underline">
                        {entry.title}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <div className="mt-10">
            <CommentsSection newsId={story.id} initialCount={story.commentCount} />
          </div>
        </article>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          {story.latitude != null && story.longitude != null ? (
            <Panel className="space-y-3">
              <h2 className="text-sm font-semibold">{t("location")}</h2>
              <MiniMap
                latitude={story.latitude}
                longitude={story.longitude}
                precision={story.precision}
                color={story.category.color}
                icon={story.category.icon}
              />
              <LocationLabel label={story.locationLabel} precision={story.precision} className="text-sm" />
              {story.isSensitive ? <p className="text-xs leading-relaxed text-muted-foreground">{t("sensitiveLocation")}</p> : null}
              {story.verificationOpen ? (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">{t("verifyHint")}</p>
                  <VerifyLocationDialog newsId={story.id} />
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="size-4" /> {t("sources", { count: story.citations.length })}
            </h2>
            {story.citations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{story.origin === "user" ? t("noSourcesUser") : t("noSources")}</p>
            ) : (
              <ul className="space-y-2.5">
                {story.citations.map((citation) => (
                  <li key={citation.id}>
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="group block rounded-lg border p-2.5 text-sm transition-colors hover:bg-accent"
                    >
                      <span className="block font-medium group-hover:underline">
                        {citation.publisherName ?? hostLabel(citation.url) ?? citation.url}
                      </span>
                      {citation.title ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{citation.title}</span> : null}
                      {citation.publishedAt ? (
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {format.dateTime(new Date(citation.publishedAt), { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {nearby.length > 0 ? (
            <Panel className="space-y-3">
              <h2 className="text-sm font-semibold">{t("nearby")}</h2>
              <ul className="space-y-3">
                {nearby.map((item) => (
                  <li key={item.id}>
                    <Link href={newsPath(item.slug)} className="group flex gap-2.5">
                      <span
                        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: item.categoryColor }}
                      >
                        <CategoryIcon icon={item.categoryIcon} className="size-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm font-medium group-hover:underline">{item.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.locationLabel} · <RelativeTime value={item.occurredAt} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </aside>
      </div>
    </Page>
  );
}
