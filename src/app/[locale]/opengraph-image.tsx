import { ImageResponse } from "next/og";

import { OG_SIZE, OgFrame, ogFonts, ogLogo } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "mappy.news";

const COPY = {
  tr: { title: "Türkiye'deki yerel olaylar, haritada.", subtitle: "Kaza, yangın, asayiş ve afet haberleri — kaynaklarıyla birlikte." },
  en: { title: "Local incidents across Turkey, on a map.", subtitle: "Accidents, fires, public safety and disasters — with their sources." },
} as const;

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const copy = COPY[locale === "en" ? "en" : "tr"];
  const [fonts, logo] = await Promise.all([ogFonts(), ogLogo()]);
  return new ImageResponse(
    (
      <OgFrame logoSrc={logo}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>{copy.title}</div>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 500, color: "#c9d8f5" }}>{copy.subtitle}</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: "#8fb4ff" }}>mappy.news</div>
      </OgFrame>
    ),
    { ...size, fonts },
  );
}
