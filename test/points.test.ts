import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { categories, pointTransactions, user, userProfiles } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { POINTS } from "@/lib/domain/constants";
import { createNews, publishPendingNews } from "@/lib/news/write";
import { awardPoints, revokeCommentPoints } from "@/lib/points";

import { createTestDatabase } from "./helpers/db";

describe("points", () => {
  let db: AppDatabase;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDatabase());
    await db.insert(user).values({ id: "reader", name: "Okur", email: "okur@example.test", emailVerified: true });
    await db.insert(userProfiles).values({ userId: "reader" });
  });

  afterAll(async () => {
    await close();
  });

  async function profile() {
    const [row] = await db.select().from(userProfiles).where(eq(userProfiles.userId, "reader"));
    return row!;
  }

  it("pays a reader once when their report is published", async () => {
    const [category] = await db.select().from(categories).where(eq(categories.key, "traffic_incidents"));
    const story = await db.transaction((tx) =>
      createNews(tx, {
        origin: "user",
        status: "pending",
        title: "Kadıköy'de kaza",
        categoryId: category!.id,
        categorySensitive: false,
        location: { latitude: 40.99, longitude: 29.03, precision: "street", district: "Kadıköy", province: "İstanbul" },
        occurredAt: new Date(),
        submittedById: "reader",
      }),
    );

    expect(await db.transaction((tx) => publishPendingNews(tx, story.id, null))).toMatchObject({ id: story.id, origin: "user" });
    // A second editor acting on the same story changes nothing.
    expect(await db.transaction((tx) => publishPendingNews(tx, story.id, null))).toBeNull();

    expect(await profile()).toMatchObject({ points: POINTS.reportPublished, publishedReportCount: 1 });
    const entries = await db.select().from(pointTransactions).where(eq(pointTransactions.userId, "reader"));
    expect(entries).toEqual([expect.objectContaining({ action: "report_published", amount: POINTS.reportPublished, balanceAfter: POINTS.reportPublished, referenceId: story.id })]);
  });

  it("takes comment points back once and never goes below zero", async () => {
    const before = (await profile()).points;
    expect(await awardPoints(db, { userId: "reader", action: "comment_posted", amount: POINTS.commentPosted, referenceId: "comment-1" })).toBe(true);
    expect(await awardPoints(db, { userId: "reader", action: "comment_posted", amount: POINTS.commentPosted, referenceId: "comment-1" })).toBe(false);
    expect(await revokeCommentPoints(db, "reader", "comment-1")).toBe(true);
    expect(await revokeCommentPoints(db, "reader", "comment-1")).toBe(false);
    expect((await profile()).points).toBe(before);

    await awardPoints(db, { userId: "reader", action: "comment_removed", amount: -10_000, referenceId: "comment-2" });
    expect((await profile()).points).toBe(0);
  });
});
