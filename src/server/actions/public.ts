"use server";

import { and, eq, sql } from "drizzle-orm";

import { ActionError, type ActionResult, runAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { comments, news, userProfiles, verifications } from "@/lib/db/schema";
import { DAILY_COMMENT_POINT_LIMIT, POINTS } from "@/lib/domain/constants";
import { isMorePrecise } from "@/lib/domain/location";
import { truncate } from "@/lib/domain/text";
import { commentInputSchema, reportInputSchema, verificationInputSchema } from "@/lib/news/schemas";
import { createNews, findCategoryByKey } from "@/lib/news/write";
import { awardPoints, countAwardsSince, revokeCommentPoints } from "@/lib/points";
import { rateLimit } from "@/lib/rate-limit";

function limit(key: string, max: number, windowMs: number) {
  if (!rateLimit(key, max, windowMs).ok) throw new ActionError("rate_limited");
}

/** A reader's report goes to the review queue; nothing is published without an editor. */
export async function submitReport(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = reportInputSchema.parse(input);
    limit(`report:hour:${user.id}`, 5, 3600_000);
    limit(`report:day:${user.id}`, 15, 24 * 3600_000);

    const category = await findCategoryByKey(db, data.categoryKey);
    if (!category?.isActive) throw new ActionError("invalid", "category");

    return db.transaction(async (tx) => {
      const created = await createNews(tx, {
        origin: "user",
        status: "pending",
        title: data.title,
        summary: truncate(data.description, 280),
        content: data.description,
        categoryId: category.id,
        categorySensitive: category.isSensitive,
        location: {
          latitude: data.location.latitude,
          longitude: data.location.longitude,
          precision: data.location.precision,
          label: data.location.label,
          province: data.location.province,
          district: data.location.district,
          neighborhood: data.location.neighborhood,
          street: data.location.street,
          confidence: 0.8,
        },
        occurredAt: new Date(data.occurredAt),
        sourceUrl: data.sourceUrl ?? null,
        imageUrl: data.imageUrl ?? null,
        submittedById: user.id,
        citation: data.sourceUrl ? { url: data.sourceUrl } : undefined,
      });
      await tx.insert(userProfiles).values({ userId: user.id }).onConflictDoNothing();
      await tx
        .update(userProfiles)
        .set({ reportCount: sql`${userProfiles.reportCount} + 1` })
        .where(eq(userProfiles.userId, user.id));
      return { id: created.id };
    });
  });
}

async function loadPublishedNews(newsId: string) {
  const [row] = await db
    .select({ id: news.id, status: news.status, precision: news.precision, isSensitive: news.isSensitive })
    .from(news)
    .where(eq(news.id, newsId))
    .limit(1);
  if (!row || row.status !== "published") throw new ActionError("not_found");
  return row;
}

export async function addComment(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = commentInputSchema.parse(input);
    limit(`comment:min:${user.id}`, 4, 60_000);
    limit(`comment:day:${user.id}`, 60, 24 * 3600_000);
    await loadPublishedNews(data.newsId);

    return db.transaction(async (tx) => {
      const [comment] = await tx
        .insert(comments)
        .values({ newsId: data.newsId, userId: user.id, body: data.body })
        .returning({ id: comments.id });
      if (!comment) throw new ActionError("server");
      await tx
        .update(news)
        .set({ commentCount: sql`${news.commentCount} + 1` })
        .where(eq(news.id, data.newsId));
      await tx.insert(userProfiles).values({ userId: user.id }).onConflictDoNothing();
      await tx
        .update(userProfiles)
        .set({ commentCount: sql`${userProfiles.commentCount} + 1` })
        .where(eq(userProfiles.userId, user.id));
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if ((await countAwardsSince(tx, user.id, "comment_posted", today)) < DAILY_COMMENT_POINT_LIMIT) {
        await awardPoints(tx, {
          userId: user.id,
          action: "comment_posted",
          amount: POINTS.commentPosted,
          referenceId: comment.id,
        });
      }
      return { id: comment.id };
    });
  });
}

/** Removes the comment and takes back the points it earned, so posting and deleting cannot farm points. */
export async function deleteComment(commentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await db.transaction(async (tx) => {
      const [comment] = await tx
        .delete(comments)
        .where(and(eq(comments.id, commentId), eq(comments.userId, user.id)))
        .returning({ id: comments.id, newsId: comments.newsId, status: comments.status });
      if (!comment) throw new ActionError("not_found");
      if (comment.status === "visible") {
        await tx
          .update(news)
          .set({ commentCount: sql`greatest(0, ${news.commentCount} - 1)` })
          .where(eq(news.id, comment.newsId));
      }
      await revokeCommentPoints(tx, user.id, comment.id);
    });
    return null;
  });
}

/** A reader suggests a more exact location; an editor reviews it before anything changes. */
export async function submitVerification(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = verificationInputSchema.parse(input);
    limit(`verification:hour:${user.id}`, 10, 3600_000);
    const target = await loadPublishedNews(data.newsId);
    if (target.isSensitive || isMorePrecise(target.precision, "neighborhood")) throw new ActionError("conflict", "closed");

    const [created] = await db
      .insert(verifications)
      .values({
        newsId: data.newsId,
        userId: user.id,
        address: data.address,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        note: data.note || null,
        evidenceUrls: data.evidenceUrl ? [data.evidenceUrl] : [],
      })
      .onConflictDoNothing()
      .returning({ id: verifications.id });
    if (!created) throw new ActionError("conflict", "duplicate");
    return { id: created.id };
  });
}
