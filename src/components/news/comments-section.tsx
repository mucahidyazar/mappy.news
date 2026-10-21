"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/layout/user-menu";
import { RankBadge } from "@/components/profile/rank-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Link, usePathname } from "@/i18n/navigation";
import { useSession } from "@/lib/auth/client";
import { addComment, deleteComment } from "@/server/actions/public";
import type { CommentDTO } from "@/server/news/comments";

import { RelativeTime } from "./relative-time";

interface Page {
  items: CommentDTO[];
  nextCursor: string | null;
}

export function CommentsSection({ newsId, initialCount }: { newsId: string; initialCount: number }) {
  const t = useTranslations("comments");
  const tErrors = useTranslations("errors");
  const pathname = usePathname();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["comments", newsId],
    queryFn: async ({ pageParam, signal }) => {
      const params = pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : "";
      const response = await fetch(`/api/news/${newsId}/comments${params}`, { signal });
      if (!response.ok) throw new Error("comments");
      return (await response.json()) as Page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const comments = query.data?.pages.flatMap((page) => page.items) ?? [];

  function submit() {
    const text = body.trim();
    if (text.length < 2) return;
    startTransition(async () => {
      const result = await addComment({ newsId, body: text });
      if (!result.ok) {
        toast.error(tErrors(result.error));
        return;
      }
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["comments", newsId] });
    });
  }

  async function remove(id: string) {
    setDeleting(id);
    const result = await deleteComment(id);
    setDeleting(null);
    if (!result.ok) {
      toast.error(tErrors(result.error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["comments", newsId] });
  }

  return (
    <section aria-labelledby="comments-title" className="space-y-5">
      <h2 id="comments-title" className="flex items-center gap-2 text-lg font-semibold">
        <MessageCircle className="size-5" /> {t("title")}
        <span className="text-sm font-normal text-muted-foreground">({Math.max(initialCount, comments.length)})</span>
      </h2>

      {session?.user ? (
        <div className="flex gap-3">
          <UserAvatar name={session.user.name} image={session.user.image} className="mt-1 size-9" />
          <div className="flex-1 space-y-2">
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t("placeholder")}
              rows={3}
              maxLength={1500}
              aria-label={t("placeholder")}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t("guidelines")}</p>
              <Button size="sm" onClick={submit} disabled={pending || body.trim().length < 2}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {t("submit")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {t.rich("signInToComment", {
            link: (chunks) => (
              <Link href={{ pathname: "/sign-in", query: { next: pathname } }} className="font-medium text-foreground underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })}
        </div>
      )}

      {query.isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-5">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <UserAvatar name={comment.author.name} image={comment.author.image} className="size-9" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{comment.author.name}</span>
                  <RankBadge points={comment.author.points} />
                  <RelativeTime value={comment.createdAt} className="text-xs text-muted-foreground" />
                  {session?.user?.id === comment.author.id ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="ml-auto text-muted-foreground"
                      onClick={() => void remove(comment.id)}
                      disabled={deleting === comment.id}
                      aria-label={t("delete")}
                    >
                      {deleting === comment.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                  ) : null}
                </div>
                <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-line">{comment.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage ? (
        <Button variant="outline" size="sm" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {query.isFetchingNextPage ? <Loader2 className="animate-spin" /> : null}
          {t("loadMore")}
        </Button>
      ) : null}
    </section>
  );
}
