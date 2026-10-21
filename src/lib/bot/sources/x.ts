import { normalizeWhitespace } from "@/lib/domain/text";
import type { NewsMedia } from "@/lib/domain/types";

import type { CollectedEntry } from "./types";

const API = "https://api.x.com/2";

interface XUrlEntity {
  start: number;
  end: number;
  url: string;
  expanded_url?: string;
  media_key?: string;
}

interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  lang?: string;
  entities?: { urls?: XUrlEntity[] };
  attachments?: { media_keys?: string[] };
}

interface XMedia {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
}

export class XApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly resetAt: Date | null = null,
  ) {
    super(message);
    this.name = "XApiError";
  }
}

async function request<T>(path: string, token: string, options: { signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<T> {
  const timeout = AbortSignal.timeout(20_000);
  const response = await (options.fetchImpl ?? fetch)(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  if (response.status === 429) {
    const reset = Number(response.headers.get("x-rate-limit-reset"));
    throw new XApiError("X rate limit reached", 429, Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : null);
  }
  if (response.status === 401 || response.status === 403) throw new XApiError(`X API refused access (${response.status})`, response.status);
  if (response.status === 402) throw new XApiError("X API credits exhausted (402)", 402);
  if (!response.ok) throw new XApiError(`X API responded ${response.status}`, response.status);
  return (await response.json()) as T;
}

export function normalizeHandle(value: string): string | null {
  const handle = value
    .trim()
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]!
    .toLowerCase();
  return /^[a-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

export async function lookupXUser(handle: string, token: string, options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}) {
  const body = await request<{ data?: { id: string; name: string; username: string } }>(`/users/by/username/${encodeURIComponent(handle)}`, token, options);
  if (!body.data) throw new XApiError(`X account @${handle} not found`, 404);
  return body.data;
}

/** Replaces t.co links with their targets and drops links that only point at attached media. */
export function expandTweetText(tweet: XTweet): string {
  let result = tweet.text;
  const urls = [...(tweet.entities?.urls ?? [])].sort((a, b) => b.start - a.start);
  for (const entity of urls) {
    const replacement = entity.media_key ? "" : (entity.expanded_url ?? entity.url);
    result = result.replace(entity.url, replacement);
  }
  return normalizeWhitespace(result.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
}

export function mapTweets(handle: string, tweets: XTweet[], media: XMedia[]): CollectedEntry[] {
  const byKey = new Map(media.map((item) => [item.media_key, item]));
  return tweets
    .map((tweet) => {
      const url = `https://x.com/${handle}/status/${tweet.id}`;
      const attachments: NewsMedia[] = (tweet.attachments?.media_keys ?? [])
        .map((key) => byKey.get(key))
        .filter((item): item is XMedia => Boolean(item))
        .map((item) =>
          item.type === "photo" && item.url
            ? { type: "image" as const, url: item.url }
            : { type: "video" as const, url, previewUrl: item.preview_image_url },
        );
      return {
        externalId: tweet.id,
        url,
        title: null,
        body: expandTweetText(tweet),
        author: `@${handle}`,
        publishedAt: tweet.created_at ? new Date(tweet.created_at) : null,
        media: [{ type: "x_post" as const, url }, ...attachments],
      };
    })
    .filter((entry) => entry.body.length > 0);
}

export interface XPollResult {
  entries: CollectedEntry[];
  userId: string;
  sinceId: string | undefined;
  reads: number;
}

/** Recent original posts of an account (no replies or reposts) newer than `sinceId`. */
export async function pollXAccount(input: {
  handle: string;
  userId?: string | null;
  sinceId?: string;
  maxResults: number;
  token: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<XPollResult> {
  const options = { signal: input.signal, fetchImpl: input.fetchImpl };
  const userId = input.userId ?? (await lookupXUser(input.handle, input.token, options)).id;
  const params = new URLSearchParams({
    max_results: String(Math.min(100, Math.max(5, input.maxResults))),
    exclude: "replies,retweets",
    "tweet.fields": "created_at,entities,attachments,lang",
    expansions: "attachments.media_keys",
    "media.fields": "type,url,preview_image_url",
  });
  if (input.sinceId) params.set("since_id", input.sinceId);
  const body = await request<{ data?: XTweet[]; includes?: { media?: XMedia[] }; meta?: { newest_id?: string; result_count?: number } }>(
    `/users/${encodeURIComponent(userId)}/tweets?${params}`,
    input.token,
    options,
  );
  const tweets = body.data ?? [];
  return {
    entries: mapTweets(input.handle, tweets, body.includes?.media ?? []),
    userId,
    sinceId: body.meta?.newest_id ?? input.sinceId,
    reads: tweets.length,
  };
}
