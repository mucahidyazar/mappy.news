import type {
  ReconciliationCheckpointStore,
  ReconciliationResult,
  XAccount,
  XPost,
  XPostEnvelope,
  XPostRepository,
  XTimelineClient,
} from "@/features/event-pipeline/server/ingestion/x/contracts";

interface ReconcileUserTimelineInput {
  readonly account: XAccount;
  readonly client: XTimelineClient;
  readonly repository: XPostRepository;
  readonly checkpoints: ReconciliationCheckpointStore;
  readonly now: () => Date;
  readonly signal: AbortSignal;
  readonly maxPages?: number;
}

const emptyResult = (): ReconciliationResult => ({
  pages: 0,
  received: 0,
  inserted: 0,
  duplicates: 0,
  updated: 0,
  watermark: null,
  checkpointAdvanced: false,
});

const compareDecimalIds = (left: string, right: string): number => {
  if (left.length !== right.length) return left.length - right.length;
  return left.localeCompare(right);
};

const findNewestPostId = (posts: readonly XPost[]): string | null =>
  posts.reduce<string | null>(
    (newest, post) =>
      newest === null || compareDecimalIds(post.id, newest) > 0
        ? post.id
        : newest,
    null,
  );

const createEnvelopes = (
  account: XAccount,
  capturedAt: string,
  posts: readonly XPost[],
): readonly XPostEnvelope[] =>
  posts.map((post) => ({
    accountId: account.id,
    accountHandle: account.handle,
    capturedAt,
    post,
  }));

export const reconcileUserTimeline = async (
  input: ReconcileUserTimelineInput,
): Promise<ReconciliationResult> => {
  if (!input.account.enabled) return emptyResult();

  const maxPages = input.maxPages ?? 1_000;
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error("maxPages must be a positive integer");
  }

  const checkpoint = await input.checkpoints.load({ accountId: input.account.id });
  const capturedAt = input.now().toISOString();
  let nextToken: string | undefined;
  let seenTokens: readonly string[] = [];
  let watermark: string | null = null;
  let pages = 0;
  let received = 0;
  let inserted = 0;
  let duplicates = 0;
  let updated = 0;

  do {
    if (pages >= maxPages) {
      throw new Error(`X timeline reconciliation exceeded ${maxPages} pages`);
    }

    const page = await input.client.getUserPosts({
      userId: input.account.xUserId,
      ...(checkpoint.sinceId === null ? {} : { sinceId: checkpoint.sinceId }),
      paginationToken: nextToken,
      maxResults: 100,
      signal: input.signal,
    });
    pages += 1;
    received += page.posts.length;

    if (pages === 1) {
      watermark = page.newestId ?? findNewestPostId(page.posts);
    }

    const persisted = await input.repository.persistBatch(
      createEnvelopes(input.account, capturedAt, page.posts),
    );
    inserted += persisted.inserted;
    duplicates += persisted.duplicates;
    updated += persisted.updated;

    if (page.errors.length > 0) {
      throw new Error(
        `X API returned a partial response for @${input.account.handle}`,
      );
    }

    const candidateToken = page.nextToken;
    if (candidateToken !== undefined && seenTokens.includes(candidateToken)) {
      throw new Error("X API returned a repeated pagination token");
    }

    if (candidateToken !== undefined) {
      seenTokens = [...seenTokens, candidateToken];
    }
    nextToken = candidateToken;
  } while (nextToken !== undefined);

  if (watermark === null || watermark === checkpoint.sinceId) {
    return {
      pages,
      received,
      inserted,
      duplicates,
      updated,
      watermark,
      checkpointAdvanced: false,
    };
  }

  const advanceResult = await input.checkpoints.advance({
    accountId: input.account.id,
    expectedVersion: checkpoint.version,
    sinceId: watermark,
    reconciledAt: capturedAt,
  });
  if (advanceResult === "conflict") {
    throw new Error(
      `X reconciliation checkpoint conflict for account ${input.account.id}`,
    );
  }

  return {
    pages,
    received,
    inserted,
    duplicates,
    updated,
    watermark,
    checkpointAdvanced: true,
  };
};
