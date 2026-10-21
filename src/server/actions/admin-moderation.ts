"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { isCategoryIconKey } from "@/components/icons/category-icon-paths";
import { ActionError, type ActionResult, runAction } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { getAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { categories, comments, news, session, user, userBans, userProfiles, verifications } from "@/lib/db/schema";
import { POINTS, USER_ROLES } from "@/lib/domain/constants";
import { locationColumns } from "@/lib/news/write";
import { awardPoints, revokeCommentPoints } from "@/lib/points";
import { CATEGORIES_TAG } from "@/server/categories";
import { getWebGeocoder } from "@/server/geocoder";

const idSchema = z.uuid();

function refresh() {
  revalidatePath("/", "layout");
}

/* ---------------------------------------------------------------- verifications */

/**
 * Applies a reader's location to the story: their map pin, or the geocoded address when they gave none.
 * Other open verifications of the same story are closed, and the reader earns points once.
 */
export async function approveVerification(input: { id: string; note?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("verifications.review");
    const id = idSchema.parse(input.id);
    const [item] = await db
      .select({ verification: verifications, news: { id: news.id, isSensitive: news.isSensitive, categoryId: news.categoryId } })
      .from(verifications)
      .innerJoin(news, eq(verifications.newsId, news.id))
      .where(eq(verifications.id, id))
      .limit(1);
    if (!item) throw new ActionError("not_found");
    if (item.verification.status !== "pending") throw new ActionError("conflict");

    let latitude = item.verification.latitude;
    let longitude = item.verification.longitude;
    let parts: { province: string | null; district: string | null; neighborhood: string | null } = { province: null, district: null, neighborhood: null };
    if (latitude == null || longitude == null) {
      const [match] = await getWebGeocoder().search(item.verification.address, { limit: 1 }).catch(() => []);
      if (!match) throw new ActionError("invalid", "geocode");
      latitude = match.latitude;
      longitude = match.longitude;
      parts = match;
    } else {
      const place = await getWebGeocoder().reverse(latitude, longitude).catch(() => null);
      if (place) parts = place;
    }
    const [category] = await db.select({ isSensitive: categories.isSensitive }).from(categories).where(eq(categories.id, item.news.categoryId)).limit(1);

    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(verifications)
        .set({ status: "approved", reviewedById: editor.id, reviewedAt: new Date(), reviewNote: input.note?.trim() || null, pointsAwarded: POINTS.verificationApproved })
        .where(and(eq(verifications.id, id), eq(verifications.status, "pending")))
        .returning({ userId: verifications.userId, newsId: verifications.newsId });
      if (!updated) throw new ActionError("conflict");

      const location = locationColumns(
        {
          latitude,
          longitude,
          precision: "street",
          street: item.verification.address,
          province: parts.province,
          district: parts.district,
          neighborhood: parts.neighborhood,
          confidence: 0.95,
          notes: "verified_by_reader",
        },
        item.news.isSensitive || Boolean(category?.isSensitive),
      );
      await tx.update(news).set(location).where(eq(news.id, updated.newsId));
      await tx
        .update(verifications)
        .set({ status: "rejected", reviewedById: editor.id, reviewedAt: new Date(), reviewNote: "superseded" })
        .where(and(eq(verifications.newsId, updated.newsId), eq(verifications.status, "pending"), ne(verifications.id, id)));
      const awarded = await awardPoints(tx, {
        userId: updated.userId,
        action: "verification_approved",
        amount: POINTS.verificationApproved,
        referenceId: id,
      });
      if (awarded) {
        await tx
          .update(userProfiles)
          .set({ verificationCount: sql`${userProfiles.verificationCount} + 1` })
          .where(eq(userProfiles.userId, updated.userId));
      }
      await audit(tx, { actorId: editor.id, action: "verification.approve", targetType: "verification", targetId: id, data: { newsId: updated.newsId } });
    });
    refresh();
    return null;
  });
}

export async function rejectVerification(input: { id: string; note?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("verifications.review");
    const id = idSchema.parse(input.id);
    await db.transaction(async (tx) => {
      const [rejected] = await tx
        .update(verifications)
        .set({ status: "rejected", reviewedById: editor.id, reviewedAt: new Date(), reviewNote: input.note?.trim() || null })
        .where(and(eq(verifications.id, id), eq(verifications.status, "pending")))
        .returning({ id: verifications.id });
      if (!rejected) throw new ActionError("conflict");
      await audit(tx, { actorId: editor.id, action: "verification.reject", targetType: "verification", targetId: id, data: { note: input.note } });
    });
    refresh();
    return null;
  });
}

/* ---------------------------------------------------------------- comments */

export async function moderateComment(input: { id: string; action: "hide" | "restore" | "delete"; reason?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("comments.moderate");
    const id = idSchema.parse(input.id);
    const action = z.enum(["hide", "restore", "delete"]).parse(input.action);
    await db.transaction(async (tx) => {
      const [comment] = await tx.select().from(comments).where(eq(comments.id, id)).limit(1);
      if (!comment) throw new ActionError("not_found");
      if (action === "delete") {
        await tx.delete(comments).where(eq(comments.id, id));
      } else {
        const status = action === "hide" ? "hidden" : "visible";
        if (comment.status === status) throw new ActionError("conflict");
        await tx.update(comments).set({ status, hiddenReason: action === "hide" ? (input.reason?.trim() || null) : null }).where(eq(comments.id, id));
      }
      const wasVisible = comment.status === "visible";
      const delta = action === "restore" ? 1 : wasVisible ? -1 : 0;
      if (delta) {
        await tx
          .update(news)
          .set({ commentCount: sql`greatest(0, ${news.commentCount} + ${delta})` })
          .where(eq(news.id, comment.newsId));
      }
      if (action !== "restore" && wasVisible) await revokeCommentPoints(tx, comment.userId, comment.id);
      await audit(tx, { actorId: editor.id, action: `comment.${action}`, targetType: "comment", targetId: id, data: { reason: input.reason } });
    });
    refresh();
    return null;
  });
}

/* ---------------------------------------------------------------- users */

export async function setUserRole(input: { userId: string; role: string }): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requirePermission("users.manage");
    const role = z.enum(USER_ROLES).parse(input.role);
    const userId = z.string().min(1).max(64).parse(input.userId);
    if (userId === admin.id) throw new ActionError("forbidden", "self");
    await db.transaction(async (tx) => {
      const [previous] = await tx.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1);
      if (!previous) throw new ActionError("not_found");
      await tx.update(user).set({ role }).where(eq(user.id, userId));
      // A demotion takes effect at once; cached sessions would otherwise keep the old role for a few minutes.
      if (previous.role !== role && role !== "admin") await tx.delete(session).where(eq(session.userId, userId));
      await audit(tx, { actorId: admin.id, action: "user.role", targetType: "user", targetId: userId, data: { from: previous.role, to: role } });
    });
    refresh();
    return null;
  });
}

export async function banUser(input: { userId: string; reason: string; hours: number | null }): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requirePermission("users.manage");
    const userId = z.string().min(1).max(64).parse(input.userId);
    const reason = z.string().trim().min(3).max(300).parse(input.reason);
    const hours = input.hours == null ? null : z.number().int().min(1).max(24 * 365 * 5).parse(input.hours);
    if (userId === admin.id) throw new ActionError("forbidden", "self");
    await getAuth().api.banUser({
      body: { userId, banReason: reason, ...(hours ? { banExpiresIn: hours * 3600 } : {}) },
      headers: await headers(),
    });
    await db.transaction(async (tx) => {
      await tx.insert(userBans).values({
        userId,
        reason,
        bannedById: admin.id,
        expiresAt: hours ? new Date(Date.now() + hours * 3600 * 1000) : null,
      });
      await audit(tx, { actorId: admin.id, action: "user.ban", targetType: "user", targetId: userId, data: { reason, hours } });
    });
    refresh();
    return null;
  });
}

export async function unbanUser(userId: string): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requirePermission("users.manage");
    const id = z.string().min(1).max(64).parse(userId);
    await getAuth().api.unbanUser({ body: { userId: id }, headers: await headers() });
    await db.transaction(async (tx) => {
      await tx
        .update(userBans)
        .set({ liftedAt: new Date(), liftedById: admin.id })
        .where(and(eq(userBans.userId, id), isNull(userBans.liftedAt)));
      await audit(tx, { actorId: admin.id, action: "user.unban", targetType: "user", targetId: id });
    });
    refresh();
    return null;
  });
}

export async function revokeUserSessions(userId: string): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requirePermission("users.manage");
    const id = z.string().min(1).max(64).parse(userId);
    await db.transaction(async (tx) => {
      await tx.delete(session).where(eq(session.userId, id));
      await audit(tx, { actorId: admin.id, action: "user.revoke_sessions", targetType: "user", targetId: id });
    });
    return null;
  });
}

/* ---------------------------------------------------------------- categories */

const categorySchema = z.object({
  id: z.uuid().optional(),
  key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, { error: "categoryKey" }),
  nameTr: z.string().trim().min(2).max(60),
  nameEn: z.string().trim().min(2).max(60),
  aiHint: z.string().trim().max(400).optional().transform((value) => value || null),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().refine(isCategoryIconKey),
  isSensitive: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});

export async function saveCategory(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requirePermission("categories.manage");
    const data = categorySchema.parse(input);
    await db.transaction(async (tx) => {
      const values = {
        nameTr: data.nameTr,
        nameEn: data.nameEn,
        aiHint: data.aiHint,
        color: data.color,
        icon: data.icon,
        isSensitive: data.isSensitive,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      };
      if (data.id) {
        const [updated] = await tx.update(categories).set(values).where(eq(categories.id, data.id)).returning({ id: categories.id });
        if (!updated) throw new ActionError("not_found");
      } else {
        const inserted = await tx.insert(categories).values({ key: data.key, ...values }).onConflictDoNothing().returning({ id: categories.id });
        if (!inserted.length) throw new ActionError("conflict", "key");
      }
      await audit(tx, { actorId: admin.id, action: data.id ? "category.update" : "category.create", targetType: "category", targetId: data.id ?? data.key });
    });
    updateTag(CATEGORIES_TAG);
    refresh();
    return null;
  });
}
