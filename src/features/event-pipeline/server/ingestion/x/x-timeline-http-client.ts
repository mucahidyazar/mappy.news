import { z } from "zod";

import type {
  GetUserPostsInput,
  XPartialError,
  XRateLimit,
  XTimelineClient,
  XTimelinePage,
} from "@/features/event-pipeline/server/ingestion/x/contracts";

const xIdSchema = z.string().regex(/^\d+$/);

const referencedPostSchema = z
  .object({
    id: xIdSchema,
    type: z.enum(["replied_to", "quoted", "retweeted"]),
  })
  .strict();

const postSchema = z
  .object({
    id: xIdSchema,
    author_id: xIdSchema,
    text: z.string(),
    created_at: z.string().datetime({ offset: true }),
    edit_history_tweet_ids: z.array(xIdSchema),
    referenced_tweets: z.array(referencedPostSchema).optional(),
  })
  .strict();

const partialErrorSchema = z
  .object({
    title: z.string().min(1),
    detail: z.string().optional(),
    type: z.string().optional(),
    resource_type: z.string().optional(),
    resource_id: z.string().optional(),
    parameter: z.string().optional(),
    value: z.string().optional(),
  })
  .strict();

const responseMetaSchema = z
  .object({
    newest_id: xIdSchema.optional(),
    oldest_id: xIdSchema.optional(),
    next_token: z.string().min(1).optional(),
    result_count: z.number().int().nonnegative(),
  })
  .strict();

const timelineResponseSchema = z
  .object({
    data: z.array(postSchema).optional(),
    errors: z.array(partialErrorSchema).optional(),
    meta: responseMetaSchema.optional(),
  })
  .strict();

interface XTimelineHttpClientOptions {
  readonly bearerToken: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
}

interface XApiErrorOptions {
  readonly message: string;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly responseBody?: unknown;
  readonly cause?: unknown;
}

export class XApiError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly responseBody?: unknown;

  constructor(options: XApiErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "XApiError";
    this.status = options.status;
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs;
    this.responseBody = options.responseBody;
  }
}

const parseJson = (body: string): unknown => {
  if (body.length === 0) return {};

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
};

const parseNonNegativeInteger = (value: string | null): number | null => {
  if (value === null || !/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const parseEpochSeconds = (value: string | null): string | null => {
  const seconds = parseNonNegativeInteger(value);
  if (seconds === null) return null;

  const date = new Date(seconds * 1_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseRetryAfter = (value: string | null): number | null => {
  if (value === null) return null;

  if (/^\d+$/.test(value)) return Number(value) * 1_000;

  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - Date.now());
};

const toRateLimit = (headers: Headers): XRateLimit => ({
  remaining: parseNonNegativeInteger(headers.get("x-rate-limit-remaining")),
  resetAt: parseEpochSeconds(headers.get("x-rate-limit-reset")),
});

const toPartialError = (
  error: z.infer<typeof partialErrorSchema>,
): XPartialError => ({
  title: error.title,
  ...(error.detail === undefined ? {} : { detail: error.detail }),
  ...(error.type === undefined ? {} : { type: error.type }),
  ...(error.resource_type === undefined
    ? {}
    : { resourceType: error.resource_type }),
  ...(error.resource_id === undefined ? {} : { resourceId: error.resource_id }),
  ...(error.parameter === undefined ? {} : { parameter: error.parameter }),
  ...(error.value === undefined ? {} : { value: error.value }),
});

const toTimelinePage = (
  response: z.infer<typeof timelineResponseSchema>,
  headers: Headers,
): XTimelinePage => ({
  posts: (response.data ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    text: post.text,
    createdAt: post.created_at,
    editHistoryPostIds: post.edit_history_tweet_ids,
    referencedPosts: post.referenced_tweets ?? [],
    raw: post,
  })),
  errors: (response.errors ?? []).map(toPartialError),
  rateLimit: toRateLimit(headers),
  ...(response.meta?.newest_id === undefined
    ? {}
    : { newestId: response.meta.newest_id }),
  ...(response.meta?.oldest_id === undefined
    ? {}
    : { oldestId: response.meta.oldest_id }),
  ...(response.meta?.next_token === undefined
    ? {}
    : { nextToken: response.meta.next_token }),
});

export class XTimelineHttpClient implements XTimelineClient {
  private readonly bearerToken: string;
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof globalThis.fetch;

  constructor(options: XTimelineHttpClientOptions) {
    if (options.bearerToken.trim().length === 0) {
      throw new Error("X API bearer token is required");
    }

    this.bearerToken = options.bearerToken;
    this.baseUrl = (options.baseUrl ?? "https://api.x.com/2").replace(/\/$/, "");
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
  }

  async getUserPosts(input: GetUserPostsInput): Promise<XTimelinePage> {
    const url = this.buildUrl(input);
    let response: Response;

    try {
      response = await this.fetchImplementation(url, {
        headers: { Authorization: `Bearer ${this.bearerToken}` },
        signal: input.signal,
      });
    } catch (error) {
      if (input.signal.aborted) throw error;

      throw new XApiError({
        message: "X API timeline request failed",
        status: null,
        retryable: true,
        retryAfterMs: null,
        cause: error,
      });
    }

    const responseBody = parseJson(await response.text());
    if (!response.ok) {
      throw new XApiError({
        message: `X API timeline request failed with status ${response.status}`,
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
        retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
        responseBody,
      });
    }

    const parsed = timelineResponseSchema.safeParse(responseBody);
    if (!parsed.success) {
      throw new Error("Invalid X API timeline response", {
        cause: parsed.error,
      });
    }

    return toTimelinePage(parsed.data, response.headers);
  }

  private buildUrl(input: GetUserPostsInput): string {
    if (!xIdSchema.safeParse(input.userId).success) {
      throw new Error("Invalid X user ID");
    }
    if (input.sinceId !== undefined && !xIdSchema.safeParse(input.sinceId).success) {
      throw new Error("Invalid X since ID");
    }
    if (!Number.isInteger(input.maxResults) || input.maxResults < 5 || input.maxResults > 100) {
      throw new Error("X timeline maxResults must be between 5 and 100");
    }

    const url = new URL(`${this.baseUrl}/users/${input.userId}/tweets`);
    url.searchParams.set("max_results", String(input.maxResults));
    url.searchParams.set(
      "tweet.fields",
      "author_id,created_at,edit_history_tweet_ids,referenced_tweets",
    );
    if (input.sinceId !== undefined) {
      url.searchParams.set("since_id", input.sinceId);
    }
    if (input.paginationToken !== undefined) {
      url.searchParams.set("pagination_token", input.paginationToken);
    }

    return url.toString();
  }
}
