import type { MetadataRoute } from "next";

import { newsPath } from "@/lib/news/format";
import { absoluteUrl } from "@/lib/site";
import { listSitemapNews } from "@/server/news/public";

export const dynamic = "force-dynamic";

const STATIC_PATHS = ["/", "/about", "/leaderboard", "/privacy", "/terms"];

function entry(path: string, lastModified?: Date): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(path, "tr"),
    lastModified,
    alternates: { languages: { tr: absoluteUrl(path, "tr"), en: absoluteUrl(path, "en") } },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stories = await listSitemapNews().catch(() => []);
  return [
    ...STATIC_PATHS.map((path) => ({ ...entry(path), changeFrequency: path === "/" ? ("hourly" as const) : ("monthly" as const) })),
    ...stories.map((story) => entry(newsPath(story.slug), story.updatedAt)),
  ];
}
