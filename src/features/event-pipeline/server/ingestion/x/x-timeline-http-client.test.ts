import { describe, expect, it, vi } from "vitest";

import {
  XApiError,
  XTimelineHttpClient,
} from "@/features/event-pipeline/server/ingestion/x/x-timeline-http-client";

describe("XTimelineHttpClient", () => {
  it("parses timeline data without numeric coercion and sends reconciliation parameters", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "1900123456789012345",
              author_id: "1800123456789012345",
              text: "Taksim'de yol kapalı",
              created_at: "2026-07-12T08:00:00.000Z",
              edit_history_tweet_ids: ["1900123456789012345"],
            },
          ],
          meta: {
            newest_id: "1900123456789012345",
            oldest_id: "1900123456789012345",
            next_token: "next-page",
            result_count: 1,
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-rate-limit-remaining": "42",
            "x-rate-limit-reset": "1783846800",
          },
        },
      ),
    );
    const client = new XTimelineHttpClient({
      bearerToken: "test-bearer-token",
      baseUrl: "https://api.x.test/2",
      fetch: fetchImplementation,
    });

    const result = await client.getUserPosts({
      userId: "1800123456789012345",
      sinceId: "1900000000000000000",
      paginationToken: "page-token",
      maxResults: 100,
      signal: new AbortController().signal,
    });

    const [requestedUrl, request] = fetchImplementation.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/2/users/1800123456789012345/tweets");
    expect(url.searchParams.get("since_id")).toBe("1900000000000000000");
    expect(url.searchParams.get("pagination_token")).toBe("page-token");
    expect(url.searchParams.get("max_results")).toBe("100");
    expect(request.headers).toEqual({ Authorization: "Bearer test-bearer-token" });
    expect(result.posts[0]?.id).toBe("1900123456789012345");
    expect(result.posts[0]?.raw).toEqual({
      id: "1900123456789012345",
      author_id: "1800123456789012345",
      text: "Taksim'de yol kapalı",
      created_at: "2026-07-12T08:00:00.000Z",
      edit_history_tweet_ids: ["1900123456789012345"],
    });
    expect(result.nextToken).toBe("next-page");
    expect(result.rateLimit.remaining).toBe(42);
  });

  it("raises a typed retryable error for rate limiting", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ title: "Too Many Requests" }), {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": "12",
        },
      }),
    );
    const client = new XTimelineHttpClient({
      bearerToken: "test-bearer-token",
      fetch: fetchImplementation,
    });

    const promise = client.getUserPosts({
      userId: "1800123456789012345",
      maxResults: 100,
      signal: new AbortController().signal,
    });

    const error: unknown = await promise.catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(XApiError);
    expect(error).toMatchObject({
      name: "XApiError",
      status: 429,
      retryable: true,
      retryAfterMs: 12_000,
    });
  });

  it("rejects malformed success payloads before persistence", async () => {
    const client = new XTimelineHttpClient({
      bearerToken: "test-bearer-token",
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 123, text: "invalid" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    });

    await expect(
      client.getUserPosts({
        userId: "1800123456789012345",
        maxResults: 100,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("Invalid X API timeline response");
  });
});
