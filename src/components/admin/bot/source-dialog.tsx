"use client";

import { Eye, Loader2, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { RelativeTime } from "@/components/news/relative-time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRouter } from "@/i18n/navigation";
import { SOURCE_TRUST_LEVELS, type SourceKind, type SourceTrust } from "@/lib/domain/constants";
import { previewFeed, saveSource } from "@/server/actions/admin-bot";

export interface EditableSource {
  id?: string;
  kind: SourceKind;
  name: string;
  url: string | null;
  handle: string | null;
  homepageUrl: string | null;
  trust: SourceTrust;
  isActive: boolean;
  autoPublish: boolean;
  pollIntervalMinutes: number;
  maxItemsPerPoll: number;
  keywordFilter: string[];
}

const EMPTY: EditableSource = {
  kind: "rss",
  name: "",
  url: "",
  handle: "",
  homepageUrl: "",
  trust: "media",
  isActive: true,
  autoPublish: false,
  pollIntervalMinutes: 15,
  maxItemsPerPoll: 20,
  keywordFilter: [],
};

export function SourceDialog({ source }: { source?: EditableSource }) {
  const t = useTranslations("admin.sources");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<EditableSource>(source ?? EMPTY);
  const [keywords, setKeywords] = useState((source?.keywordFilter ?? []).join(", "));
  const [preview, setPreview] = useState<{ title: string; publishedAt: string | null }[] | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof EditableSource>(key: K, next: EditableSource[K]) {
    setValue((current) => ({ ...current, [key]: next }));
  }

  function test() {
    if (!value.url) return;
    startTransition(async () => {
      const result = await previewFeed(value.url!);
      if (!result.ok) {
        setPreview(null);
        toast.error(t("previewFailed", { message: result.message ?? "" }));
        return;
      }
      setPreview(result.data);
    });
  }

  function submit() {
    startTransition(async () => {
      const result = await saveSource({
        ...value,
        url: value.url ?? "",
        handle: value.handle ?? "",
        homepageUrl: value.homepageUrl ?? "",
        keywordFilter: keywords
          .split(",")
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword.length >= 2),
      });
      if (!result.ok) {
        toast.error(result.message === "exists" ? t("exists") : tErrors(result.error));
        return;
      }
      toast.success(t("saved"));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValue(source ?? EMPTY);
          setKeywords((source?.keywordFilter ?? []).join(", "));
          setPreview(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {source ? (
          <Button variant="ghost" size="icon-sm" aria-label={t("edit")}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> {t("add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{source ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          {!source ? (
            <ToggleGroup type="single" variant="outline" value={value.kind} onValueChange={(kind) => kind && set("kind", kind as SourceKind)} className="w-full">
              <ToggleGroupItem value="rss" className="flex-1">
                RSS / Atom
              </ToggleGroupItem>
              <ToggleGroupItem value="x" className="flex-1">
                X (Twitter)
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          <Field>
            <FieldLabel htmlFor="source-name">{t("name")}</FieldLabel>
            <Input id="source-name" value={value.name} onChange={(event) => set("name", event.target.value)} placeholder={value.kind === "x" ? "AFAD" : "Anadolu Ajansı"} />
          </Field>
          {value.kind === "x" ? (
            <Field>
              <FieldLabel htmlFor="source-handle">{t("handle")}</FieldLabel>
              <Input id="source-handle" value={value.handle ?? ""} onChange={(event) => set("handle", event.target.value)} placeholder="@AFADBaskanlik" />
              <FieldDescription>{t("handleHint")}</FieldDescription>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="source-url">{t("feedUrl")}</FieldLabel>
              <div className="flex gap-2">
                <Input id="source-url" type="url" value={value.url ?? ""} onChange={(event) => set("url", event.target.value)} placeholder="https://…/rss" />
                <Button type="button" variant="outline" onClick={test} disabled={pending || !value.url}>
                  {pending ? <Loader2 className="animate-spin" /> : <Eye className="size-4" />}
                  {t("test")}
                </Button>
              </div>
              {preview ? (
                <ul className="mt-2 space-y-1 rounded-lg border bg-muted/40 p-2.5 text-xs">
                  {preview.length === 0 ? <li>{t("previewEmpty")}</li> : null}
                  {preview.map((entry) => (
                    <li key={entry.title} className="flex justify-between gap-2">
                      <span className="line-clamp-1">{entry.title}</span>
                      {entry.publishedAt ? <RelativeTime value={entry.publishedAt} className="shrink-0 text-muted-foreground" /> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel>{t("trust")}</FieldLabel>
              <Select value={value.trust} onValueChange={(trust) => set("trust", trust as SourceTrust)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TRUST_LEVELS.map((trust) => (
                    <SelectItem key={trust} value={trust}>
                      {t(`trustLevels.${trust}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="source-interval">{t("interval")}</FieldLabel>
              <Input id="source-interval" type="number" min={5} max={1440} value={value.pollIntervalMinutes} onChange={(event) => set("pollIntervalMinutes", Number(event.target.value) || 15)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="source-max">{t("maxItems")}</FieldLabel>
              <Input id="source-max" type="number" min={5} max={100} value={value.maxItemsPerPoll} onChange={(event) => set("maxItemsPerPoll", Number(event.target.value) || 20)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="source-keywords">{t("keywords")}</FieldLabel>
            <Input id="source-keywords" value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder={t("keywordsPlaceholder")} />
            <FieldDescription>{t("keywordsHint")}</FieldDescription>
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={value.isActive} onCheckedChange={(checked) => set("isActive", checked)} />
            {t("active")}
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={value.autoPublish} onCheckedChange={(checked) => set("autoPublish", checked)} className="mt-0.5" />
            <span>
              {t("autoPublish")}
              <span className="block text-xs text-muted-foreground">{t("autoPublishHint")}</span>
            </span>
          </label>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || value.name.trim().length < 2}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
