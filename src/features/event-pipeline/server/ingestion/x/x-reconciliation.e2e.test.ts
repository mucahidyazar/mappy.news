import { describe, expect, it, vi } from "vitest";

import { reconcileUserTimeline } from "@/features/event-pipeline/server/ingestion/x/reconcile-user-timeline";
import type {
  ReconciliationCheckpointStore,
  XPostEnvelope,
  XPostRepository,
} from "@/features/event-pipeline/server/ingestion/x/contracts";
import { XTimelineHttpClient } from "@/features/event-pipeline/server/ingestion/x/x-timeline-http-client";

describe("X reconciliation vertical slice", () => {
  it("fetches two pages, deduplicates overlap, and advances only after persistence", async () => {
    const responses = [
      {
        data: [
          {
            id: "1900000000000000100",
            author_id: "1800123456789012345",
            text: "first",
            created_at: "2026-07-12T08:00:00.000Z",
            edit_history_tweet_ids: ["1900000000000000100"],
          },
          {
            id: "1900000000000000090",
            author_id: "1800123456789012345",
            text: "overlap",
            created_at: "2026-07-12T07:59:00.000Z",
            edit_history_tweet_ids: ["1900000000000000090"],
          },
        ],
        meta: {
          newest_id: "1900000000000000100",
          oldest_id: "1900000000000000090",
          next_token: "page-2",
          result_count: 2,
        },
      },
      {
        data: [
          {
            id: "1900000000000000090",
            author_id: "1800123456789012345",
            text: "overlap",
            created_at: "2026-07-12T07:59:00.000Z",
            edit_history_tweet_ids: ["1900000000000000090"],
          },
          {
            id: "1900000000000000080",
            author_id: "1800123456789012345",
            text: "last",
            created_at: "2026-07-12T07:58:00.000Z",
            edit_history_tweet_ids: ["1900000000000000080"],
          },
        ],
        meta: {
          newest_id: "1900000000000000090",
          oldest_id: "1900000000000000080",
          result_count: 2,
        },
      },
    ];
    const httpClient = new XTimelineHttpClient({
      bearerToken: "test-token",
      baseUrl: "https://api.x.test/2",
      fetch: vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(responses.shift()), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    });
    const stored = new Map<string, XPostEnvelope>();
    const repository: XPostRepository = {
      persistBatch: async (items) => {
        let inserted = 0;
        let duplicates = 0;
        for (const item of items) {
          if (stored.has(item.post.id)) {
            duplicates += 1;
          } else {
            stored.set(item.post.id, item);
            inserted += 1;
          }
        }
        return { inserted, duplicates, updated: 0 };
      },
    };
    let checkpoint = {
      sinceId: "1900000000000000000" as string | null,
      version: 1,
    };
    const checkpoints: ReconciliationCheckpointStore = {
      load: async () => checkpoint,
      advance: async ({ expectedVersion, sinceId }) => {
        if (expectedVersion !== checkpoint.version) return "conflict";
        checkpoint = { sinceId, version: checkpoint.version + 1 };
        return "advanced";
      },
    };

    const result = await reconcileUserTimeline({
      account: {
        id: "account:chaos-news",
        xUserId: "1800123456789012345",
        handle: "chaos_news",
        enabled: true,
      },
      client: httpClient,
      repository,
      checkpoints,
      now: () => new Date("2026-07-12T08:10:00.000Z"),
      signal: new AbortController().signal,
    });

    expect([...stored.keys()]).toEqual([
      "1900000000000000100",
      "1900000000000000090",
      "1900000000000000080",
    ]);
    expect(checkpoint).toEqual({
      sinceId: "1900000000000000100",
      version: 2,
    });
    expect(result).toMatchObject({
      pages: 2,
      received: 4,
      inserted: 3,
      duplicates: 1,
    });
  });
});
