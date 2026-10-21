import { ImageResponse } from "next/og";

import { categoryName } from "@/lib/news/format";
import { OG_SIZE, OgFrame, ogFonts, ogLogo } from "@/lib/og";
import { getNewsBySlug } from "@/server/news/public";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "mappy.news";

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const [story, fonts, logo] = await Promise.all([getNewsBySlug(slug).catch(() => null), ogFonts(), ogLogo()]);
  const title = story?.title ?? "mappy.news";
  const date = story
    ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" }).format(
        new Date(story.occurredAt),
      )
    : "";

  return new ImageResponse(
    (
      <OgFrame logoSrc={logo}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {story ? (
            <div style={{ display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  padding: "8px 18px",
                  borderRadius: 999,
                  backgroundColor: story.category.color,
                  fontSize: 26,
                  fontWeight: 700,
                }}
              >
                {categoryName(story.category, locale)}
              </div>
            </div>
          ) : null}
          <div style={{ display: "flex", fontSize: title.length > 80 ? 52 : 62, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1 }}>
            {title.length > 140 ? `${title.slice(0, 137)}…` : title}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 28, fontWeight: 500, color: "#c9d8f5" }}>
          {story ? <span>{story.locationLabel}</span> : null}
          {date ? <span style={{ opacity: 0.8 }}>· {date}</span> : null}
        </div>
      </OgFrame>
    ),
    { ...size, fonts },
  );
}
