import { createHash } from "node:crypto";

import { XMLParser } from "fast-xml-parser";

import { stripHtml, truncate } from "@/lib/domain/text";
import type { NewsMedia, SourceCursor } from "@/lib/domain/types";

import { BOT_USER_AGENT, safeFetchText, type SafeFetchOptions } from "../net";

import type { CollectedEntry } from "./types";

const ARRAY_TAGS = new Set(["item", "entry", "link", "category", "media:content", "media:thumbnail", "enclosure"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

type Node = Record<string, unknown> | string | undefined;

function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "object") {
    const value = (node as Record<string, unknown>)["#text"];
    return value == null ? "" : String(value);
  }
  return "";
}

function attr(node: unknown, name: string): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const value = (node as Record<string, unknown>)[`@_${name}`];
  return typeof value === "string" ? value : undefined;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function firstImageInHtml(html: string): string | undefined {
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return match?.[1];
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function fallbackId(title: string, link: string, date: string) {
  return createHash("sha256").update(`${title}|${link}|${date}`).digest("hex").slice(0, 32);
}

function imageFrom(entry: Record<string, unknown>, html: string): string | undefined {
  for (const enclosure of asArray(entry.enclosure as Node | Node[])) {
    const url = attr(enclosure, "url");
    if (isHttpUrl(url) && (attr(enclosure, "type") ?? "image").startsWith("image")) return url;
  }
  for (const media of [...asArray(entry["media:content"] as Node | Node[]), ...asArray(entry["media:thumbnail"] as Node | Node[])]) {
    const url = attr(media, "url");
    if (isHttpUrl(url) && (attr(media, "medium") ?? attr(media, "type") ?? "image").startsWith("image")) return url;
  }
  const image = text(entry.image);
  if (isHttpUrl(image)) return image;
  const inline = firstImageInHtml(html);
  return isHttpUrl(inline) ? inline : undefined;
}

function rssEntry(item: Record<string, unknown>): CollectedEntry | null {
  const title = stripHtml(text(item.title));
  const link = text(asArray(item.link as Node | Node[])[0]) || attr(asArray(item.link as Node | Node[])[0], "href") || "";
  const html = text(item["content:encoded"]) || text(item.description);
  const body = stripHtml(html);
  const date = text(item.pubDate) || text(item["dc:date"]) || text(item.published) || text(item.updated);
  const externalId = text(item.guid) || link || fallbackId(title, link, date);
  if (!title && !body) return null;
  const image = imageFrom(item, html);
  return {
    externalId: externalId.slice(0, 500),
    url: isHttpUrl(link) ? link : null,
    title: title || null,
    body: truncate(body || title, 4000),
    author: stripHtml(text(item["dc:creator"]) || text(item.author)) || null,
    publishedAt: parseDate(date),
    media: image ? [{ type: "image", url: image } satisfies NewsMedia] : [],
  };
}

function atomEntry(entry: Record<string, unknown>): CollectedEntry | null {
  const title = stripHtml(text(entry.title));
  const links = asArray(entry.link as Node | Node[]);
  const alternate = links.find((link) => (attr(link, "rel") ?? "alternate") === "alternate") ?? links[0];
  const link = attr(alternate, "href") ?? text(alternate);
  const html = text(entry.content) || text(entry.summary);
  const body = stripHtml(html);
  const date = text(entry.published) || text(entry.updated);
  if (!title && !body) return null;
  const image = imageFrom(entry, html);
  const author = entry.author && typeof entry.author === "object" ? text((entry.author as Record<string, unknown>).name) : text(entry.author);
  return {
    externalId: (text(entry.id) || link || fallbackId(title, link, date)).slice(0, 500),
    url: isHttpUrl(link) ? link : null,
    title: title || null,
    body: truncate(body || title, 4000),
    author: author || null,
    publishedAt: parseDate(date),
    media: image ? [{ type: "image", url: image }] : [],
  };
}

/** Parses RSS 2.0, RSS 1.0 (RDF) and Atom documents into entries, newest first. */
export function parseFeed(xml: string): CollectedEntry[] {
  const document = parser.parse(xml) as Record<string, unknown>;
  const rss = document.rss as Record<string, unknown> | undefined;
  const rdf = document["rdf:RDF"] as Record<string, unknown> | undefined;
  const feed = document.feed as Record<string, unknown> | undefined;

  let entries: (CollectedEntry | null)[] = [];
  if (rss?.channel) {
    const channel = asArray(rss.channel as Node | Node[])[0] as Record<string, unknown>;
    entries = asArray(channel?.item as Record<string, unknown>[]).map(rssEntry);
  } else if (rdf) {
    entries = asArray(rdf.item as Record<string, unknown>[]).map(rssEntry);
  } else if (feed) {
    entries = asArray(feed.entry as Record<string, unknown>[]).map(atomEntry);
  } else {
    throw new Error("Not an RSS or Atom feed");
  }

  return entries
    .filter((entry): entry is CollectedEntry => entry !== null)
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
}

export interface FeedPollResult {
  entries: CollectedEntry[];
  cursor: SourceCursor;
  notModified: boolean;
}

/** Fetches a feed with conditional request headers so unchanged feeds cost nothing. */
export async function pollFeed(
  url: string,
  cursor: SourceCursor,
  options: Pick<SafeFetchOptions, "signal" | "fetchImpl" | "resolve"> = {},
): Promise<FeedPollResult> {
  const headers: Record<string, string> = {
    "User-Agent": BOT_USER_AGENT,
    Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
  };
  if (cursor.etag) headers["If-None-Match"] = cursor.etag;
  if (cursor.lastModified) headers["If-Modified-Since"] = cursor.lastModified;

  const { response, body } = await safeFetchText(url, { ...options, headers });
  if (response.status === 304) return { entries: [], cursor, notModified: true };
  if (!response.ok) throw new Error(`Feed responded ${response.status}`);

  const entries = parseFeed(body);
  const newest = entries[0]?.publishedAt;
  return {
    entries,
    notModified: false,
    cursor: {
      ...cursor,
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
      lastItemAt: newest ? newest.toISOString() : cursor.lastItemAt,
    },
  };
}
