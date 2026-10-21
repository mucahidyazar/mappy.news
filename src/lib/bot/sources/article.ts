import { normalizeWhitespace, stripHtml, truncate } from "@/lib/domain/text";

import { BOT_USER_AGENT, safeFetchText, type SafeFetchOptions } from "../net";

const MAX_ARTICLE_CHARS = 6_000;
const MIN_ARTICLE_CHARS = 200;

/** Article, NewsArticle, ReportageNewsArticle, … (also as schema.org URLs). */
function isArticle(node: Record<string, unknown>) {
  const type = node["@type"];
  return (Array.isArray(type) ? type : [type]).some((value) => typeof value === "string" && value.endsWith("Article"));
}

/** The first `articleBody` of an Article in JSON-LD, which may nest it in arrays or an `@graph`. */
function findArticleBody(node: unknown, depth = 0): string | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findArticleBody(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  if (isArticle(record) && typeof record.articleBody === "string") return record.articleBody;
  return findArticleBody(record["@graph"], depth + 1);
}

/**
 * The text of a news page: the publisher's NewsArticle JSON-LD when present, else the paragraphs of its
 * `<article>` (or of the whole page). Returns null when nothing article-like is found.
 */
export function extractArticleText(html: string): string | null {
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const body = findArticleBody(JSON.parse(match[1]!.trim()));
      const text = body ? normalizeWhitespace(stripHtml(body)) : "";
      if (text.length >= MIN_ARTICLE_CHARS) return truncate(text, MAX_ARTICLE_CHARS);
    } catch {
      // Broken JSON-LD is common; fall back to the markup.
    }
  }
  const scope = /<article[\s>][\s\S]*?<\/article>/i.exec(html)?.[0] ?? html;
  const paragraphs = [...scope.matchAll(/<p[\s>][\s\S]*?<\/p>/gi)].map((match) => stripHtml(match[0])).filter((text) => text.length >= 60);
  const text = paragraphs.join("\n");
  return text.length >= MIN_ARTICLE_CHARS ? truncate(text, MAX_ARTICLE_CHARS) : null;
}

/** Fetches a story page with the bot's network guard; any failure just means "no article text". */
export async function fetchArticleText(url: string, options: Pick<SafeFetchOptions, "signal" | "fetchImpl" | "resolve"> = {}): Promise<string | null> {
  try {
    const { response, body } = await safeFetchText(url, {
      ...options,
      headers: { "User-Agent": BOT_USER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
      timeoutMs: 12_000,
      maxBytes: 3 * 1024 * 1024,
    });
    if (!response.ok || !/html|xml/i.test(response.headers.get("content-type") ?? "text/html")) return null;
    return extractArticleText(body);
  } catch {
    return null;
  }
}
