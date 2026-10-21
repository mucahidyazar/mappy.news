import { and, eq, gte, sql } from "drizzle-orm";

import { pointTransactions, userProfiles } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/types";
import type { PointAction } from "@/lib/domain/constants";

export interface AwardInput {
  userId: string;
  action: PointAction;
  amount: number;
  /** The comment, verification or story the points are for; one award per (user, action, reference). */
  referenceId: string;
  note?: string;
}

/**
 * Adds (or, with a negative amount, removes) points inside the caller's transaction. Returns false when the
 * same award was already made, so retries never pay twice. The balance never drops below zero.
 */
export async function awardPoints(tx: DbExecutor, input: AwardInput): Promise<boolean> {
  if (!Number.isInteger(input.amount) || input.amount === 0) return false;

  const [entry] = await tx
    .insert(pointTransactions)
    .values({
      userId: input.userId,
      action: input.action,
      amount: input.amount,
      balanceAfter: 0,
      referenceId: input.referenceId,
      note: input.note,
    })
    .onConflictDoNothing()
    .returning({ id: pointTransactions.id });
  if (!entry) return false;

  await tx.insert(userProfiles).values({ userId: input.userId }).onConflictDoNothing();
  const [profile] = await tx
    .update(userProfiles)
    .set({ points: sql`greatest(0, ${userProfiles.points} + ${input.amount})` })
    .where(eq(userProfiles.userId, input.userId))
    .returning({ points: userProfiles.points });

  await tx
    .update(pointTransactions)
    .set({ balanceAfter: profile?.points ?? 0 })
    .where(eq(pointTransactions.id, entry.id));
  return true;
}

/** How many awards of this kind the user received since `since`, e.g. to cap daily comment points. */
export async function countAwardsSince(tx: DbExecutor, userId: string, action: PointAction, since: Date) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(pointTransactions)
    .where(and(eq(pointTransactions.userId, userId), eq(pointTransactions.action, action), gte(pointTransactions.createdAt, since)));
  return row?.count ?? 0;
}

/** Takes back what a comment earned when it is deleted or hidden. */
export async function revokeCommentPoints(tx: DbExecutor, userId: string, commentId: string) {
  const [earned] = await tx
    .select({ amount: pointTransactions.amount })
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.userId, userId),
        eq(pointTransactions.action, "comment_posted"),
        eq(pointTransactions.referenceId, commentId),
      ),
    )
    .limit(1);
  if (!earned) return false;
  return awardPoints(tx, { userId, action: "comment_removed", amount: -earned.amount, referenceId: commentId });
}
