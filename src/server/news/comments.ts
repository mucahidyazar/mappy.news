import "server-only";

import { and, desc, eq, lt, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { comments, user, userProfiles } from "@/lib/db/schema";

export interface CommentDTO {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; image: string | null; points: number };
}

const PAGE_SIZE = 20;

/** Visible comments, newest first, with a (createdAt, id) cursor. */
export async function listComments(newsId: string, cursor?: string | null): Promise<{ items: CommentDTO[]; nextCursor: string | null }> {
  let cursorCondition;
  if (cursor) {
    const [at, id] = cursor.split("_");
    const date = new Date(Number(at));
    if (id && !Number.isNaN(date.getTime())) {
      cursorCondition = or(lt(comments.createdAt, date), and(eq(comments.createdAt, date), lt(comments.id, id)));
    }
  }
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      authorId: user.id,
      authorName: user.name,
      authorImage: user.image,
      points: userProfiles.points,
    })
    .from(comments)
    .innerJoin(user, eq(comments.userId, user.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
    .where(and(eq(comments.newsId, newsId), eq(comments.status, "visible"), cursorCondition))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(PAGE_SIZE + 1);

  const items = rows.slice(0, PAGE_SIZE).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: { id: row.authorId, name: row.authorName, image: row.authorImage, points: row.points ?? 0 },
  }));
  const last = rows.length > PAGE_SIZE ? items[items.length - 1] : undefined;
  return { items, nextCursor: last ? `${new Date(last.createdAt).getTime()}_${last.id}` : null };
}
