import { describe, expect, it, vi } from "vitest";

import { reconcileUserTimeline } from "@/features/event-pipeline/server/ingestion/x/reconcile-user-timeline";
import type {
  ReconciliationCheckpointStore,
  XPostRepository,
  XTimelineClient,
  XTimelinePage,
} from "@/features/event-pipeline/server/ingestion/x/contracts";

const makePost = (id: string) => ({
  id,
  authorId: "1800123456789012345",
  text: `post ${id}`,
  createdAt: "2026-07-12T08:00:00.000Z",
  editHistoryPostIds: [id],
  referencedPosts: [],
  raw: { id, text: `post ${id}` },
});

const page = (
  ids: readonly string[],
  options: Partial<XTimelinePage> = {},
): XTimelinePage => ({
  posts: ids.map(makePost),
  errors: [],
  rateLimit: { remaining: 99, resetAt: "2026-07-12T09:00:00.000Z" },
  ...options,
});

const createDependencies = () => {
  const client: XTimelineClient = {
    getUserPosts: vi.fn(),
  };
  const repository: XPostRepository = {
    persistBatch: vi.fn().mockResolvedValue({
      inserted: 1,
      duplicates: 0,
      updated: 0,
    }),
  };
  const checkpoints: ReconciliationCheckpointStore = {
    load: vi.fn().mockResolvedValue({
      sinceId: "1900000000000000000",
      version: 7,
    }),
    advance: vi.fn().mockResolvedValue("advanced"),
  };

  return { client, repository, checkpoints };
};

describe("reconcileUserTimeline", () => {
  it("keeps since_id stable across pagination and advances to the first-page watermark", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.client.getUserPosts)
      .mockResolvedValueOnce(
        page(["1900000000000000100", "1900000000000000090"], {
          newestId: "1900000000000000100",
          nextToken: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        page(["1900000000000000090", "1900000000000000080"]),
      );

    const result = await reconcileUserTimeline({
      account: {
        id: "account:chaos-news",
        xUserId: "1800123456789012345",
        handle: "chaos_news",
        enabled: true,
      },
      ...dependencies,
      now: () => new Date("2026-07-12T08:10:00.000Z"),
      signal: new AbortController().signal,
    });

    expect(dependencies.client.getUserPosts).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sinceId: "1900000000000000000",
        paginationToken: undefined,
      }),
    );
    expect(dependencies.client.getUserPosts).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sinceId: "1900000000000000000",
        paginationToken: "page-2",
      }),
    );
    expect(dependencies.checkpoints.advance).toHaveBeenCalledWith({
      accountId: "account:chaos-news",
      expectedVersion: 7,
      sinceId: "1900000000000000100",
      reconciledAt: "2026-07-12T08:10:00.000Z",
    });
    expect(dependencies.repository.persistBatch).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          channel: "user_timeline",
          receivedAt: "2026-07-12T08:10:00.000Z",
          post: expect.objectContaining({
            raw: {
              id: "1900000000000000100",
              text: "post 1900000000000000100",
            },
          }),
        }),
      ]),
    );
    expect(result).toMatchObject({ pages: 2, received: 4, watermark: "1900000000000000100" });
  });

  it("never advances the checkpoint after a later page fails to persist", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.client.getUserPosts)
      .mockResolvedValueOnce(
        page(["1900000000000000100"], {
          newestId: "1900000000000000100",
          nextToken: "page-2",
        }),
      )
      .mockResolvedValueOnce(page(["1900000000000000090"]));
    vi.mocked(dependencies.repository.persistBatch)
      .mockResolvedValueOnce({ inserted: 1, duplicates: 0, updated: 0 })
      .mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      reconcileUserTimeline({
        account: {
          id: "account:chaos-news",
          xUserId: "1800123456789012345",
          handle: "chaos_news",
          enabled: true,
        },
        ...dependencies,
        now: () => new Date("2026-07-12T08:10:00.000Z"),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("database unavailable");

    expect(dependencies.checkpoints.advance).not.toHaveBeenCalled();
  });

  it("stops a repeated pagination token instead of looping forever", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.client.getUserPosts)
      .mockResolvedValueOnce(
        page(["1900000000000000100"], {
          newestId: "1900000000000000100",
          nextToken: "same-token",
        }),
      )
      .mockResolvedValueOnce(
        page(["1900000000000000090"], { nextToken: "same-token" }),
      );

    await expect(
      reconcileUserTimeline({
        account: {
          id: "account:chaos-news",
          xUserId: "1800123456789012345",
          handle: "chaos_news",
          enabled: true,
        },
        ...dependencies,
        now: () => new Date("2026-07-12T08:10:00.000Z"),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("repeated pagination token");

    expect(dependencies.checkpoints.advance).not.toHaveBeenCalled();
  });

  it("persists partial data for audit but does not advance through an API partial error", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.client.getUserPosts).mockResolvedValueOnce(
      page(["1900000000000000100"], {
        newestId: "1900000000000000100",
        errors: [{ title: "Partial Error", detail: "One post was unavailable" }],
      }),
    );

    await expect(
      reconcileUserTimeline({
        account: {
          id: "account:chaos-news",
          xUserId: "1800123456789012345",
          handle: "chaos_news",
          enabled: true,
        },
        ...dependencies,
        now: () => new Date("2026-07-12T08:10:00.000Z"),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("partial response");

    expect(dependencies.repository.persistBatch).toHaveBeenCalledOnce();
    expect(dependencies.checkpoints.advance).not.toHaveBeenCalled();
  });
});
