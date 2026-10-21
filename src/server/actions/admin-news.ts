"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, type ActionResult, runAction } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { botItems, news, newsCitations } from "@/lib/db/schema";
import { searchText } from "@/lib/domain/text";
import { newsEditSchema, parentLinkSchema, reportInputSchema } from "@/lib/news/schemas";
import { createNews, findCategoryByKey, locationColumns, publishPendingNews } from "@/lib/news/write";
import { searchParentCandidates } from "@/server/admin/news";

function refresh() {
  revalidatePath("/", "layout");
}

const idSchema = z.uuid();

export async function approveNews(input: { id: string; note?: string }): Promise<ActionResult<{ slug: string }>> {
  return runAction(async () => {
    const editor = await requirePermission("news.review");
    const id = idSchema.parse(input.id);
    const result = await db.transaction(async (tx) => {
      const [story] = await tx.select({ latitude: news.publicLatitude }).from(news).where(eq(news.id, id)).limit(1);
      if (!story) throw new ActionError("not_found");
      if (story.latitude == null) throw new ActionError("invalid", "location");
      const published = await publishPendingNews(tx, id, editor.id, input.note?.trim() || null);
      if (!published) throw new ActionError("conflict");
      await tx.update(botItems).set({ status: "published" }).where(and(eq(botItems.newsId, id), eq(botItems.status, "queued")));
      await audit(tx, { actorId: editor.id, action: "news.approve", targetType: "news", targetId: id, data: { note: input.note } });
      return { slug: published.slug };
    });
    refresh();
    return result;
  });
}

export async function rejectNews(input: { id: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("news.review");
    const id = idSchema.parse(input.id);
    const reason = z.string().trim().min(3).max(500).parse(input.reason);
    await db.transaction(async (tx) => {
      const [rejected] = await tx
        .update(news)
        .set({ status: "rejected", rejectionReason: reason, reviewedById: editor.id, reviewedAt: new Date() })
        .where(and(eq(news.id, id), eq(news.status, "pending")))
        .returning({ id: news.id });
      if (!rejected) throw new ActionError("conflict");
      await tx
        .update(botItems)
        .set({ status: "rejected", rejectionReason: `editor: ${reason}` })
        .where(and(eq(botItems.newsId, id), eq(botItems.status, "queued")));
      await audit(tx, { actorId: editor.id, action: "news.reject", targetType: "news", targetId: id, data: { reason } });
    });
    refresh();
    return null;
  });
}

export async function setNewsStatus(input: { id: string; status: "archived" | "published" }): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("news.manage");
    const id = idSchema.parse(input.id);
    const status = z.enum(["archived", "published"]).parse(input.status);
    await db.transaction(async (tx) => {
      const from = status === "archived" ? ["published", "pending"] : ["archived", "rejected"];
      const [changed] = await tx
        .update(news)
        .set({ status, ...(status === "published" ? { publishedAt: sql`coalesce(${news.publishedAt}, now())` } : {}) })
        .where(and(eq(news.id, id), inArray(news.status, from as ("published" | "pending" | "archived" | "rejected")[])))
        .returning({ id: news.id, latitude: news.publicLatitude });
      if (!changed) throw new ActionError("conflict");
      if (status === "published" && changed.latitude == null) throw new ActionError("invalid", "location");
      await audit(tx, { actorId: editor.id, action: `news.${status === "archived" ? "archive" : "restore"}`, targetType: "news", targetId: id });
    });
    refresh();
    return null;
  });
}

export async function updateNews(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("news.review");
    const data = newsEditSchema.parse(input);
    const category = await findCategoryByKey(db, data.categoryKey);
    if (!category) throw new ActionError("invalid", "category");
    await db.transaction(async (tx) => {
      const location = locationColumns(
        {
          latitude: data.location.latitude,
          longitude: data.location.longitude,
          precision: data.location.precision,
          label: data.location.label,
          province: data.location.province,
          district: data.location.district,
          neighborhood: data.location.neighborhood,
          street: data.location.street,
          confidence: 1,
        },
        data.isSensitive || category.isSensitive,
      );
      const [updated] = await tx
        .update(news)
        .set({
          title: data.title,
          summary: data.summary,
          content: data.content,
          categoryId: category.id,
          occurredAt: new Date(data.occurredAt),
          ...location,
          sourceUrl: data.sourceUrl ?? null,
          imageUrl: data.imageUrl ?? null,
          isSensitive: data.isSensitive,
          isFeatured: data.isFeatured,
          searchText: searchText(data.title, data.summary, location.locationLabel),
        })
        .where(eq(news.id, data.id))
        .returning({ id: news.id });
      if (!updated) throw new ActionError("not_found");
      if (data.sourceUrl) {
        const inserted = await tx.insert(newsCitations).values({ newsId: data.id, url: data.sourceUrl }).onConflictDoNothing().returning({ id: newsCitations.id });
        if (inserted.length) {
          await tx.update(news).set({ citationCount: sql`${news.citationCount} + 1` }).where(eq(news.id, data.id));
        }
      }
      await audit(tx, { actorId: editor.id, action: "news.update", targetType: "news", targetId: data.id });
    });
    refresh();
    return null;
  });
}

/** Attaches a story to an earlier one as an update, correction or development (always to the root story). */
export async function linkToParent(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("news.review");
    const data = parentLinkSchema.parse(input);
    await db.transaction(async (tx) => {
      let parentId = data.parentId;
      if (parentId) {
        if (parentId === data.id) throw new ActionError("invalid");
        const [parent] = await tx.select({ id: news.id, parentId: news.parentId }).from(news).where(eq(news.id, parentId)).limit(1);
        if (!parent) throw new ActionError("not_found");
        parentId = parent.parentId ?? parent.id;
        if (parentId === data.id) throw new ActionError("invalid");
        // Follow-ups of this story move to the new root so the timeline stays one level deep.
        await tx.update(news).set({ parentId }).where(eq(news.parentId, data.id));
      }
      await tx
        .update(news)
        .set({
          parentId,
          relation: parentId ? (data.relation ?? "update") : null,
          suggestedParentId: null,
          suggestedParentConfidence: null,
          suggestedParentReason: null,
        })
        .where(eq(news.id, data.id));
      await audit(tx, { actorId: editor.id, action: parentId ? "news.link" : "news.unlink", targetType: "news", targetId: data.id, data: { parentId, relation: data.relation } });
    });
    refresh();
    return null;
  });
}

/**
 * The story duplicates `targetId`: its sources become citations of the target and it is archived.
 * Bot items that produced it now point at the target.
 */
export async function mergeIntoStory(input: { id: string; targetId: string }): Promise<ActionResult<{ slug: string }>> {
  return runAction(async () => {
    const editor = await requirePermission("news.review");
    const id = idSchema.parse(input.id);
    const targetId = idSchema.parse(input.targetId);
    if (id === targetId) throw new ActionError("invalid");
    const result = await db.transaction(async (tx) => {
      const [duplicate] = await tx.select().from(news).where(eq(news.id, id)).limit(1);
      const [target] = await tx.select({ id: news.id, slug: news.slug }).from(news).where(eq(news.id, targetId)).limit(1);
      if (!duplicate || !target) throw new ActionError("not_found");
      const citations = await tx.select().from(newsCitations).where(eq(newsCitations.newsId, id));
      const urls = new Set(citations.map((citation) => citation.url));
      if (duplicate.sourceUrl) urls.add(duplicate.sourceUrl);
      let added = 0;
      for (const url of urls) {
        const citation = citations.find((item) => item.url === url);
        const inserted = await tx
          .insert(newsCitations)
          .values({
            newsId: targetId,
            url,
            title: citation?.title ?? duplicate.title,
            publisherName: citation?.publisherName ?? null,
            publishedAt: citation?.publishedAt ?? duplicate.occurredAt,
            sourceId: citation?.sourceId ?? duplicate.sourceId,
          })
          .onConflictDoNothing()
          .returning({ id: newsCitations.id });
        added += inserted.length;
      }
      if (added) await tx.update(news).set({ citationCount: sql`${news.citationCount} + ${added}` }).where(eq(news.id, targetId));
      await tx
        .update(news)
        .set({ status: "archived", rejectionReason: "duplicate", parentId: null, reviewedById: editor.id, reviewedAt: new Date() })
        .where(eq(news.id, id));
      await tx.update(botItems).set({ newsId: targetId, status: "duplicate" }).where(eq(botItems.newsId, id));
      await audit(tx, { actorId: editor.id, action: "news.merge", targetType: "news", targetId: id, data: { targetId, citations: added } });
      return { slug: target.slug };
    });
    refresh();
    return result;
  });
}

export async function deleteNews(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("news.manage");
    const newsId = idSchema.parse(id);
    await db.transaction(async (tx) => {
      const [removed] = await tx.delete(news).where(eq(news.id, newsId)).returning({ id: news.id, title: news.title });
      if (!removed) throw new ActionError("not_found");
      await audit(tx, { actorId: editor.id, action: "news.delete", targetType: "news", targetId: newsId, data: { title: removed.title } });
    });
    refresh();
    return null;
  });
}

/** An editor writes a story directly; it is published at once. */
export async function createEditorStory(input: unknown): Promise<ActionResult<{ id: string; slug: string }>> {
  return runAction(async () => {
    const editor = await requirePermission("news.manage");
    const data = reportInputSchema.parse(input);
    const category = await findCategoryByKey(db, data.categoryKey);
    if (!category) throw new ActionError("invalid", "category");
    const created = await db.transaction(async (tx) => {
      const story = await createNews(tx, {
        origin: "admin",
        status: "published",
        title: data.title,
        summary: data.description.slice(0, 280),
        content: data.description,
        categoryId: category.id,
        categorySensitive: category.isSensitive,
        location: { ...data.location, confidence: 1 },
        occurredAt: new Date(data.occurredAt),
        sourceUrl: data.sourceUrl ?? null,
        imageUrl: data.imageUrl ?? null,
        reviewedById: editor.id,
        citation: data.sourceUrl ? { url: data.sourceUrl } : undefined,
      });
      await audit(tx, { actorId: editor.id, action: "news.create", targetType: "news", targetId: story.id });
      return story;
    });
    refresh();
    return created;
  });
}

export async function findParentCandidates(input: { query: string; excludeId: string }) {
  await requirePermission("news.review");
  const query = z.string().trim().min(2).max(80).safeParse(input.query);
  if (!query.success) return [];
  const rows = await searchParentCandidates(query.data, idSchema.parse(input.excludeId));
  return rows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() }));
}
