"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import {
  Archive,
  Bot,
  CheckCircle2,
  ExternalLink,
  GitMerge,
  Link2,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { useValidationMessage } from "@/components/forms/use-validation-message";
import { LocationPicker } from "@/components/map/location-picker";
import { RelativeTime } from "@/components/news/relative-time";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { translateDynamic } from "@/i18n/dynamic";
import { Link, useRouter } from "@/i18n/navigation";
import { NEWS_RELATIONS, type NewsRelation } from "@/lib/domain/constants";
import type { Casualties } from "@/lib/domain/types";
import { categoryName, newsPath } from "@/lib/news/format";
import { newsEditSchema } from "@/lib/news/schemas";
import type { CategoryDTO } from "@/lib/news/types";
import { cn } from "@/lib/utils";
import {
  approveNews,
  deleteNews,
  findParentCandidates,
  linkToParent,
  mergeIntoStory,
  rejectNews,
  setNewsStatus,
  updateNews,
} from "@/server/actions/admin-news";
import type { AdminNewsDetail } from "@/server/admin/news";

import { STATUS_BADGE } from "./status-styles";

type FormInput = z.input<typeof newsEditSchema>;
type FormOutput = z.output<typeof newsEditSchema>;

const REJECT_REASONS = ["notIncident", "duplicate", "insufficient", "unverifiable", "rules"] as const;

function Score({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return null;
  const percent = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", percent >= 75 ? "bg-success" : percent >= 45 ? "bg-warning" : "bg-destructive")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function NewsEditor({
  story,
  categories,
  canManage,
  nextHref,
}: {
  story: AdminNewsDetail;
  categories: CategoryDTO[];
  canManage: boolean;
  /** Where to go after the story leaves the review queue. */
  nextHref?: string;
}) {
  const t = useTranslations("admin.editor");
  const tErrors = useTranslations("errors");
  const tStatus = useTranslations("story.status");
  const tRelation = useTranslations("story.relation");
  const locale = useLocale();
  const router = useRouter();
  const message = useValidationMessage();
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(newsEditSchema),
    defaultValues: {
      id: story.id,
      title: story.title,
      summary: story.summary ?? "",
      content: story.content ?? "",
      categoryKey: story.categoryKey,
      occurredAt: story.occurredAt,
      location:
        story.location.latitude != null && story.location.longitude != null
          ? {
              latitude: story.location.latitude,
              longitude: story.location.longitude,
              precision: story.location.precision,
              label: story.location.label,
              province: story.location.province,
              district: story.location.district,
              neighborhood: story.location.neighborhood,
              street: story.location.street,
            }
          : undefined,
      sourceUrl: story.sourceUrl ?? "",
      imageUrl: story.imageUrl ?? "",
      isSensitive: story.isSensitive,
      isFeatured: story.isFeatured,
      deaths: story.deaths,
      injured: story.injured,
    },
  });
  const { errors, isDirty } = form.formState;

  function run<T>(task: () => Promise<{ ok: boolean; error?: string; message?: string; data?: T }>, success: string, after?: (data: T) => void) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast.error(result.message === "location" ? t("needsLocation") : tErrors((result.error ?? "server") as "server"));
        return;
      }
      toast.success(success);
      if (after) after(result.data as T);
      else router.refresh();
    });
  }

  const save = (publish: boolean) =>
    form.handleSubmit((values) => {
      startTransition(async () => {
        const saved = await updateNews(values);
        if (!saved.ok) {
          toast.error(tErrors(saved.error));
          return;
        }
        if (!publish) {
          toast.success(t("saved"));
          form.reset(form.getValues());
          router.refresh();
          return;
        }
        const approved = await approveNews({ id: story.id });
        if (!approved.ok) {
          toast.error(approved.message === "location" ? t("needsLocation") : tErrors(approved.error));
          return;
        }
        toast.success(t("published"));
        if (nextHref) router.push(nextHref);
        else router.refresh();
      });
    })();

  const analysis = story.aiAnalysis;
  const origin = story.origin;
  const merge = analysis?.merge ?? null;
  // A suggestion the AI left because it wasn't sure carries its reason; the rule's reasons are codes.
  const suggestionReason = story.suggestedParent?.reason
    ? merge && !merge.applied
      ? t("aiReason", { reason: story.suggestedParent.reason })
      : (translateDynamic(t, `ruleReasons.${story.suggestedParent.reason}`) ?? story.suggestedParent.reason)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={STATUS_BADGE[story.status]}>
          {tStatus(story.status)}
        </Badge>
        <Badge variant="secondary" className="gap-1">
          {origin === "bot" ? <Bot className="size-3" /> : <UserRound className="size-3" />}
          {t(`origin.${origin}`)}
        </Badge>
        {story.source ? <Badge variant="outline">{story.source.name}</Badge> : null}
        {story.submittedBy ? (
          <span className="text-xs text-muted-foreground">
            {story.submittedBy.name} · {story.submittedBy.email}
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">
          · <RelativeTime value={story.createdAt} />
        </span>
        {story.status === "published" ? (
          <Button asChild variant="ghost" size="xs" className="ml-auto gap-1">
            <Link href={newsPath(story.slug)} target="_blank">
              {t("viewOnSite")} <ExternalLink className="size-3" />
            </Link>
          </Button>
        ) : null}
      </div>

      {story.rejectionReason && story.status !== "published" ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          {t("rejectionReason")}: {story.rejectionReason}
        </p>
      ) : null}

      {story.suggestedParent ? (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <p>
              {t(merge && !merge.applied && merge.action === "duplicate" ? "suggestedDuplicate" : "suggestedParent", { confidence: story.suggestedParent.confidence ?? 0 })}{" "}
              <Link href={`/admin/news/${story.suggestedParent.id}`} className="font-medium underline underline-offset-4">
                {story.suggestedParent.title}
              </Link>
            </p>
            {suggestionReason ? <p className="mt-0.5 text-xs text-muted-foreground">{suggestionReason}</p> : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => linkToParent({ id: story.id, parentId: story.suggestedParent!.id, relation: "update" }), t("linked"))}
            >
              <Link2 className="size-3.5" /> {t("attachAsUpdate")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => mergeIntoStory({ id: story.id, targetId: story.suggestedParent!.id }), t("merged"), (data) => router.push(nextHref ?? `/admin/news/${story.suggestedParent!.id}`, { scroll: true }) ?? data)}
            >
              <GitMerge className="size-3.5" /> {t("mergeDuplicate")}
            </Button>
          </div>
        </div>
      ) : null}

      {analysis ? (
        <Collapsible defaultOpen={story.status === "pending"} className="rounded-xl border bg-card">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium">
            <span className="flex items-center gap-2">
              <Bot className="size-4" /> {t("analysis")}
            </span>
            <span className="text-xs text-muted-foreground">
              {analysis.model} · {analysis.promptVersion}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-4 border-t px-4 py-3 sm:grid-cols-2">
            <div className="space-y-3">
              <Score label={t("editorialScore")} value={analysis.editorialScore} />
              <Score label={t("confidence")} value={analysis.confidence} />
              <Score label={t("locationConfidence")} value={analysis.location.confidence} />
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-muted-foreground">{t("locationMention")}</dt>
                <dd>{analysis.location.mention || "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-muted-foreground">{t("locationEvidence")}</dt>
                <dd>{analysis.location.evidence || "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-muted-foreground">{t("sensitivity")}</dt>
                <dd>{analysis.isSensitive ? (analysis.sensitivityType ?? t("yes")) : t("no")}</dd>
              </div>
              {analysis.casualties ? (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-muted-foreground">{t("reportedCasualties")}</dt>
                  <dd>
                    <CasualtyText casualties={analysis.casualties} />
                  </dd>
                </div>
              ) : null}
              {merge ? (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-muted-foreground">{t("mergeDecision")}</dt>
                  <dd>
                    <span className="font-medium">{t(`mergeActions.${merge.action}`)}</span> · {Math.round(merge.confidence * 100)}% ·{" "}
                    {merge.applied ? t("mergeApplied") : t("mergeLeft")}
                    {merge.reason ? <span className="mt-0.5 block text-muted-foreground">{merge.reason}</span> : null}
                  </dd>
                </div>
              ) : null}
              {analysis.keywords.length ? (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-muted-foreground">{t("keywords")}</dt>
                  <dd className="flex flex-wrap gap-1">
                    {analysis.keywords.map((keyword) => (
                      <Badge key={keyword} variant="secondary" className="text-[10px]">
                        {keyword}
                      </Badge>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {story.similar.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <p className="border-b px-4 py-2.5 text-sm font-medium">{t("similar")}</p>
          <ul className="divide-y">
            {story.similar.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/news/${item.id}`} className="line-clamp-1 text-sm font-medium hover:underline">
                    {item.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {tStatus(item.status)} · <RelativeTime value={item.occurredAt} />
                    {item.distanceKm != null ? ` · ${item.distanceKm} km` : ""} · {t("match", { score: item.score })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => linkToParent({ id: story.id, parentId: item.id, relation: "update" }), t("linked"))}
                  >
                    <Link2 className="size-3" /> {t("attach")}
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => mergeIntoStory({ id: story.id, targetId: item.id }), t("merged"), () => router.push(nextHref ?? `/admin/news/${item.id}`))}
                  >
                    <GitMerge className="size-3" /> {t("merge")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={(event) => event.preventDefault()} noValidate>
        <FieldGroup className="gap-4">
          <Field data-invalid={Boolean(errors.title)}>
            <FieldLabel htmlFor="edit-title">{t("title")}</FieldLabel>
            <Input id="edit-title" {...form.register("title")} maxLength={160} />
            <FieldError errors={[message(errors.title)]} />
          </Field>
          <Field data-invalid={Boolean(errors.summary)}>
            <FieldLabel htmlFor="edit-summary">{t("summary")}</FieldLabel>
            <Textarea id="edit-summary" rows={3} {...form.register("summary")} maxLength={600} />
            <FieldError errors={[message(errors.summary)]} />
          </Field>
          <Field data-invalid={Boolean(errors.content)}>
            <FieldLabel htmlFor="edit-content">{t("content")}</FieldLabel>
            <Textarea id="edit-content" rows={8} {...form.register("content")} maxLength={10_000} />
            <FieldError errors={[message(errors.content)]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.categoryKey)}>
              <FieldLabel>{t("category")}</FieldLabel>
              <Controller
                control={form.control}
                name="categoryKey"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.key} value={category.key}>
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                          {categoryName(category, locale)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field data-invalid={Boolean(errors.occurredAt)}>
              <FieldLabel htmlFor="edit-when">{t("occurredAt")}</FieldLabel>
              <Controller
                control={form.control}
                name="occurredAt"
                render={({ field }) => (
                  <Input
                    id="edit-when"
                    type="datetime-local"
                    value={field.value ? format(new Date(field.value), "yyyy-MM-dd'T'HH:mm") : ""}
                    onChange={(event) => field.onChange(event.target.value ? new Date(event.target.value).toISOString() : "")}
                  />
                )}
              />
              <FieldError errors={[message(errors.occurredAt)]} />
            </Field>
          </div>
          <fieldset className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">{t("casualties")}</legend>
            {(["deaths", "injured"] as const).map((name) => (
              <Field key={name} data-invalid={Boolean(errors[name])}>
                <FieldLabel htmlFor={`edit-${name}`} className="text-xs font-normal text-muted-foreground">
                  {t(name)}
                </FieldLabel>
                <Controller
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <Input
                      id={`edit-${name}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(event.target.value === "" ? null : Number(event.target.value))}
                      className="w-32"
                    />
                  )}
                />
                <FieldError errors={[message(errors[name])]} />
              </Field>
            ))}
            <p className="text-xs text-muted-foreground sm:col-span-2">{t("casualtiesHint")}</p>
          </fieldset>
          <Field data-invalid={Boolean(errors.location)}>
            <FieldLabel>{t("location")}</FieldLabel>
            <Controller
              control={form.control}
              name="location"
              render={({ field }) => <LocationPicker value={field.value} onChange={field.onChange} invalid={Boolean(errors.location)} />}
            />
            {story.location.mention ? <p className="text-xs text-muted-foreground">{t("sourceMention", { mention: story.location.mention })}</p> : null}
            <FieldError errors={[message(errors.location?.latitude ?? (errors.location ? { message: "locationRequired" } : undefined))]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.sourceUrl)}>
              <FieldLabel htmlFor="edit-source">{t("sourceUrl")}</FieldLabel>
              <Input id="edit-source" type="url" {...form.register("sourceUrl")} />
              <FieldError errors={[message(errors.sourceUrl)]} />
            </Field>
            <Field data-invalid={Boolean(errors.imageUrl)}>
              <FieldLabel htmlFor="edit-image">{t("imageUrl")}</FieldLabel>
              <Input id="edit-image" type="url" {...form.register("imageUrl")} />
              <FieldError errors={[message(errors.imageUrl)]} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-6">
            <Controller
              control={form.control}
              name="isSensitive"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                  {t("sensitive")}
                </label>
              )}
            />
            <Controller
              control={form.control}
              name="isFeatured"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                  {t("featured")}
                </label>
              )}
            />
          </div>
        </FieldGroup>
      </form>

      {story.citations.length ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm font-medium">{t("citations", { count: story.citations.length })}</p>
          <ul className="space-y-1.5 text-sm">
            {story.citations.map((citation) => (
              <li key={citation.id} className="flex items-center gap-2">
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                <a href={citation.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                  {citation.publisherName ?? citation.title ?? citation.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {story.parent || story.followUps.length ? (
        <div className="rounded-xl border bg-card p-4 text-sm">
          {story.parent ? (
            <>
              <p>
                {t("attachedTo", { relation: tRelation(story.parent.relation ?? "update") })}{" "}
                <Link href={`/admin/news/${story.parent.id}`} className="font-medium underline underline-offset-4">
                  {story.parent.title}
                </Link>
              </p>
              {merge?.applied && merge.action === "update" && merge.targetId ? (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="mt-0.5 size-3 shrink-0" /> {t("aiLinked", { reason: merge.reason || "—" })}
                </p>
              ) : null}
            </>
          ) : null}
          {story.followUps.length ? (
            <div className="mt-2 space-y-1">
              <p className="text-muted-foreground">{t("followUps")}</p>
              {story.followUps.map((item) => (
                <Link key={item.id} href={`/admin/news/${item.id}`} className="block hover:underline">
                  · {item.title} ({tRelation(item.relation ?? "update")}, {tStatus(item.status)})
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur">
        {story.status === "pending" ? (
          <>
            <Button variant="outline" className="gap-1.5 text-destructive" onClick={() => setRejectOpen(true)} disabled={pending}>
              <XCircle className="size-4" /> {t("reject")}
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={() => setLinkOpen(true)} disabled={pending}>
              <Link2 className="size-4" /> {t("attachToStory")}
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => save(false)} disabled={pending || !isDirty}>
                <Save className="size-4" /> {t("save")}
              </Button>
              <Button onClick={() => save(true)} disabled={pending} className="gap-1.5">
                {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="size-4" />}
                {t("publish")}
              </Button>
            </div>
          </>
        ) : (
          <>
            {story.status === "published" && canManage ? (
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={pending}
                onClick={() => run(() => setNewsStatus({ id: story.id, status: "archived" }), t("archived"))}
              >
                <Archive className="size-4" /> {t("archive")}
              </Button>
            ) : null}
            {(story.status === "archived" || story.status === "rejected") && canManage ? (
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={pending}
                onClick={() => run(() => setNewsStatus({ id: story.id, status: "published" }), t("published"))}
              >
                <RotateCcw className="size-4" /> {t("republish")}
              </Button>
            ) : null}
            <Button variant="outline" className="gap-1.5" onClick={() => setLinkOpen(true)} disabled={pending}>
              <Link2 className="size-4" /> {t("attachToStory")}
            </Button>
            {canManage ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="gap-1.5 text-destructive" disabled={pending}>
                    <Trash2 className="size-4" /> {t("delete")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() => run(() => deleteNews(story.id), t("deleted"), () => router.push("/admin/news"))}
                    >
                      {t("delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            <Button onClick={() => save(false)} disabled={pending || !isDirty} className="ml-auto gap-1.5">
              {pending ? <Loader2 className="animate-spin" /> : <Save className="size-4" />}
              {t("save")}
            </Button>
          </>
        )}
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rejectTitle")}</DialogTitle>
            <DialogDescription>{t("rejectDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {REJECT_REASONS.map((reason) => (
              <Button key={reason} type="button" size="xs" variant="outline" onClick={() => setRejectReason(t(`reasons.${reason}`))}>
                {t(`reasons.${reason}`)}
              </Button>
            ))}
          </div>
          <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={3} maxLength={500} placeholder={t("rejectPlaceholder")} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={pending || rejectReason.trim().length < 3}
              onClick={() =>
                run(
                  () => rejectNews({ id: story.id, reason: rejectReason }),
                  t("rejected"),
                  () => {
                    setRejectOpen(false);
                    if (nextHref) router.push(nextHref);
                    else router.refresh();
                  },
                )
              }
            >
              {t("reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LinkParentDialog storyId={story.id} open={linkOpen} onOpenChange={setLinkOpen} />
    </div>
  );
}

/** "2 ölü, 3 yaralı", "ölü ya da yaralı yok"; nothing for counts the report didn't give. */
function CasualtyText({ casualties }: { casualties: Casualties }) {
  const t = useTranslations("casualties");
  const parts = [
    casualties.deaths != null ? t("deaths", { count: casualties.deaths }) : null,
    casualties.injured != null ? t("injured", { count: casualties.injured }) : null,
  ].filter(Boolean);
  if (casualties.deaths === 0 && casualties.injured === 0) return <>{t("none")}</>;
  return <>{parts.length ? parts.join(", ") : "—"}</>;
}

function LinkParentDialog({ storyId, open, onOpenChange }: { storyId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("admin.editor");
  const tRelation = useTranslations("story.relation");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof findParentCandidates>>>([]);
  const [relation, setRelation] = useState<NewsRelation>("update");
  const [pending, startTransition] = useTransition();

  function search() {
    startTransition(async () => {
      setResults(await findParentCandidates({ query, excludeId: storyId }));
    });
  }

  function link(parentId: string | null) {
    startTransition(async () => {
      const result = await linkToParent({ id: storyId, parentId, relation: parentId ? relation : null });
      if (!result.ok) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(parentId ? t("linked") : t("unlinked"));
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("attachToStory")}</DialogTitle>
          <DialogDescription>{t("attachDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                search();
              }
            }}
            placeholder={t("searchStories")}
          />
          <Select value={relation} onValueChange={(value) => setRelation(value as NewsRelation)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NEWS_RELATIONS.map((item) => (
                <SelectItem key={item} value={item}>
                  {tRelation(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={search} disabled={pending || query.trim().length < 2}>
            {pending ? <Loader2 className="animate-spin" /> : t("search")}
          </Button>
        </div>
        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
          {results.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">{t("noStories")}</li>
          ) : (
            results.map((item) => (
              <li key={item.id} className="flex items-center gap-2 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.locationLabel} · <RelativeTime value={item.occurredAt} />
                  </p>
                </div>
                <Button size="xs" onClick={() => link(item.id)} disabled={pending}>
                  {t("attach")}
                </Button>
              </li>
            ))
          )}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => link(null)} disabled={pending}>
            {t("unlink")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
