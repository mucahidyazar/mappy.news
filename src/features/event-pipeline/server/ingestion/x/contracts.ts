export interface XAccount {
  readonly id: string;
  readonly xUserId: string;
  readonly handle: string;
  readonly enabled: boolean;
}

export type XReferencedPostType = "replied_to" | "quoted" | "retweeted";

export interface XReferencedPost {
  readonly id: string;
  readonly type: XReferencedPostType;
}

export interface XPost {
  readonly id: string;
  readonly authorId: string;
  readonly text: string;
  readonly createdAt: string;
  readonly editHistoryPostIds: readonly string[];
  readonly referencedPosts: readonly XReferencedPost[];
}

export interface XPartialError {
  readonly title: string;
  readonly detail?: string;
  readonly type?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly parameter?: string;
  readonly value?: string;
}

export interface XRateLimit {
  readonly remaining: number | null;
  readonly resetAt: string | null;
}

export interface XTimelinePage {
  readonly posts: readonly XPost[];
  readonly errors: readonly XPartialError[];
  readonly rateLimit: XRateLimit;
  readonly newestId?: string;
  readonly oldestId?: string;
  readonly nextToken?: string;
}

export interface GetUserPostsInput {
  readonly userId: string;
  readonly sinceId?: string;
  readonly paginationToken?: string;
  readonly maxResults: number;
  readonly signal: AbortSignal;
}

export interface XTimelineClient {
  getUserPosts(input: GetUserPostsInput): Promise<XTimelinePage>;
}

export interface XPostEnvelope {
  readonly accountId: string;
  readonly accountHandle: string;
  readonly capturedAt: string;
  readonly post: XPost;
}

export interface PersistBatchResult {
  readonly inserted: number;
  readonly duplicates: number;
  readonly updated: number;
}

export interface XPostRepository {
  persistBatch(items: readonly XPostEnvelope[]): Promise<PersistBatchResult>;
}

export interface ReconciliationCheckpoint {
  readonly sinceId: string | null;
  readonly version: number;
}

export interface AdvanceCheckpointInput {
  readonly accountId: string;
  readonly expectedVersion: number;
  readonly sinceId: string;
  readonly reconciledAt: string;
}

export type AdvanceCheckpointResult = "advanced" | "conflict";

export interface ReconciliationCheckpointStore {
  load(input: {
    readonly accountId: string;
  }): Promise<ReconciliationCheckpoint>;
  advance(input: AdvanceCheckpointInput): Promise<AdvanceCheckpointResult>;
}

export interface ReconciliationResult {
  readonly pages: number;
  readonly received: number;
  readonly inserted: number;
  readonly duplicates: number;
  readonly updated: number;
  readonly watermark: string | null;
  readonly checkpointAdvanced: boolean;
}
