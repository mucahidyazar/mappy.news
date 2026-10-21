"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CategoryIcon } from "@/components/icons/category-icon";
import { CATEGORY_ICON_PATHS } from "@/components/icons/category-icon-paths";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { saveCategory } from "@/server/actions/admin-moderation";

export interface EditableCategory {
  id?: string;
  key: string;
  nameTr: string;
  nameEn: string;
  aiHint: string | null;
  color: string;
  icon: string;
  isSensitive: boolean;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY: EditableCategory = {
  key: "",
  nameTr: "",
  nameEn: "",
  aiHint: "",
  color: "#2563EB",
  icon: "newspaper-sharp",
  isSensitive: false,
  isActive: true,
  sortOrder: 50,
};

export function CategoryEditor({ category }: { category?: EditableCategory }) {
  const t = useTranslations("admin.categories");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<EditableCategory>(category ?? EMPTY);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof EditableCategory>(key: K, next: EditableCategory[K]) {
    setValue((current) => ({ ...current, [key]: next }));
  }

  function submit() {
    startTransition(async () => {
      const result = await saveCategory({ ...value, aiHint: value.aiHint ?? "" });
      if (!result.ok) {
        toast.error(result.message === "key" ? t("keyTaken") : tErrors(result.error));
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
        if (next) setValue(category ?? EMPTY);
      }}
    >
      <DialogTrigger asChild>
        {category ? (
          <Button variant="ghost" size="icon-sm" aria-label={t("edit")}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> {t("create")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? t("editTitle") : t("createTitle")}</DialogTitle>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="category-key">{t("key")}</FieldLabel>
            <Input id="category-key" value={value.key} onChange={(event) => set("key", event.target.value)} disabled={Boolean(category)} placeholder="road_closures" />
            <FieldDescription>{t("keyHint")}</FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="category-tr">{t("nameTr")}</FieldLabel>
              <Input id="category-tr" value={value.nameTr} onChange={(event) => set("nameTr", event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="category-en">{t("nameEn")}</FieldLabel>
              <Input id="category-en" value={value.nameEn} onChange={(event) => set("nameEn", event.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="category-hint">{t("aiHint")}</FieldLabel>
            <Textarea id="category-hint" rows={3} value={value.aiHint ?? ""} onChange={(event) => set("aiHint", event.target.value)} maxLength={400} />
            <FieldDescription>{t("aiHintHelp")}</FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <Field>
              <FieldLabel htmlFor="category-color">{t("color")}</FieldLabel>
              <Input id="category-color" type="color" value={value.color} onChange={(event) => set("color", event.target.value)} className="h-9 w-16 p-1" />
            </Field>
            <Field>
              <FieldLabel htmlFor="category-order">{t("sortOrder")}</FieldLabel>
              <Input id="category-order" type="number" min={0} max={1000} value={value.sortOrder} onChange={(event) => set("sortOrder", Number(event.target.value) || 0)} />
            </Field>
          </div>
          <Field>
            <FieldLabel>{t("icon")}</FieldLabel>
            <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label={t("icon")}>
              {Object.keys(CATEGORY_ICON_PATHS).map((icon) => (
                <button
                  key={icon}
                  type="button"
                  role="radio"
                  aria-checked={value.icon === icon}
                  aria-label={icon}
                  onClick={() => set("icon", icon)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-lg border transition-colors",
                    value.icon === icon ? "border-transparent text-white" : "hover:bg-accent",
                  )}
                  style={value.icon === icon ? { backgroundColor: value.color } : undefined}
                >
                  <CategoryIcon icon={icon} className="size-5" />
                </button>
              ))}
            </div>
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={value.isSensitive} onCheckedChange={(checked) => set("isSensitive", checked)} className="mt-0.5" />
            <span>
              {t("sensitive")}
              <span className="block text-xs text-muted-foreground">{t("sensitiveHelp")}</span>
            </span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={value.isActive} onCheckedChange={(checked) => set("isActive", checked)} />
            {t("active")}
          </label>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
