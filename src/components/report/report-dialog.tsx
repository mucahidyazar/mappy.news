"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { useValidationMessage } from "@/components/forms/use-validation-message";
import { CategoryIcon } from "@/components/icons/category-icon";
import { LocationPicker } from "@/components/map/location-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { categoryName } from "@/lib/news/format";
import { reportInputSchema } from "@/lib/news/schemas";
import type { CategoryDTO } from "@/lib/news/types";
import { cn } from "@/lib/utils";
import { submitReport } from "@/server/actions/public";

type FormInput = z.input<typeof reportInputSchema>;
type FormOutput = z.output<typeof reportInputSchema>;

function toLocalInput(iso: string | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : format(date, "yyyy-MM-dd'T'HH:mm");
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const response = await fetch("/api/categories");
      if (!response.ok) throw new Error("categories");
      return (await response.json()) as CategoryDTO[];
    },
    staleTime: 10 * 60_000,
  });
}

export function ReportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("report");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const message = useValidationMessage();
  const categories = useCategories();
  const [pending, startTransition] = useTransition();

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(reportInputSchema),
    defaultValues: {
      title: "",
      description: "",
      categoryKey: "",
      occurredAt: new Date().toISOString(),
      location: undefined,
      sourceUrl: "",
      imageUrl: "",
      confirm: false as unknown as true,
    },
    mode: "onTouched",
  });
  const { errors } = form.formState;
  const description = useWatch({ control: form.control, name: "description" }) ?? "";

  function onSubmit(values: FormOutput) {
    startTransition(async () => {
      const result = await submitReport(values);
      if (result.ok) {
        toast.success(t("successTitle"), { description: t("successDescription") });
        form.reset();
        onOpenChange(false);
        return;
      }
      if (result.fieldErrors) {
        for (const [name, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) form.setError(name as keyof FormInput, { message: messages[0] });
        }
      }
      toast.error(tErrors(result.error));
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="sticky top-0 z-10 border-b bg-background/95 p-5 backdrop-blur">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col" noValidate>
          <FieldGroup className="gap-5 p-5">
            <Field data-invalid={Boolean(errors.categoryKey)}>
              <FieldLabel>{t("category")}</FieldLabel>
              {categories.isPending ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} className="h-11 rounded-xl" />
                  ))}
                </div>
              ) : (
                <Controller
                  control={form.control}
                  name="categoryKey"
                  render={({ field }) => (
                    <div role="radiogroup" aria-label={t("category")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {(categories.data ?? []).map((category) => {
                        const active = field.value === category.key;
                        return (
                          <button
                            key={category.key}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => field.onChange(category.key)}
                            className={cn(
                              "flex h-11 items-center gap-2 rounded-xl border px-2.5 text-left text-[13px] font-medium transition-colors",
                              active ? "border-transparent text-white shadow-sm" : "border-border hover:bg-accent",
                            )}
                            style={active ? { backgroundColor: category.color } : undefined}
                          >
                            <span
                              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white"
                              style={{ backgroundColor: active ? "rgb(255 255 255 / 0.2)" : category.color }}
                            >
                              <CategoryIcon icon={category.icon} className="size-3.5" />
                            </span>
                            <span className="line-clamp-2 leading-tight">{categoryName(category, locale)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              )}
              <FieldError errors={[message(errors.categoryKey)]} />
            </Field>

            <Field data-invalid={Boolean(errors.title)}>
              <FieldLabel htmlFor="report-title">{t("headline")}</FieldLabel>
              <Input id="report-title" {...form.register("title")} placeholder={t("headlinePlaceholder")} maxLength={140} aria-invalid={Boolean(errors.title)} />
              <FieldError errors={[message(errors.title)]} />
            </Field>

            <Field data-invalid={Boolean(errors.description)}>
              <FieldLabel htmlFor="report-description">{t("details")}</FieldLabel>
              <Textarea
                id="report-description"
                {...form.register("description")}
                placeholder={t("detailsPlaceholder")}
                rows={5}
                maxLength={4000}
                aria-invalid={Boolean(errors.description)}
              />
              <FieldDescription className="flex justify-between gap-2">
                <span>{t("detailsHint")}</span>
                <span className="tabular-nums">{description.length}/4000</span>
              </FieldDescription>
              <FieldError errors={[message(errors.description)]} />
            </Field>

            <Field data-invalid={Boolean(errors.occurredAt)} className="sm:max-w-xs">
              <FieldLabel htmlFor="report-when">{t("when")}</FieldLabel>
              <Controller
                control={form.control}
                name="occurredAt"
                render={({ field }) => (
                  <Input
                    id="report-when"
                    type="datetime-local"
                    value={toLocalInput(field.value)}
                    max={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                    onChange={(event) => field.onChange(event.target.value ? new Date(event.target.value).toISOString() : "")}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <FieldError errors={[message(errors.occurredAt)]} />
            </Field>

            <Field data-invalid={Boolean(errors.location)}>
              <FieldLabel>{t("where")}</FieldLabel>
              <FieldDescription>{t("whereHint")}</FieldDescription>
              <Controller
                control={form.control}
                name="location"
                render={({ field }) => (
                  <LocationPicker value={field.value} onChange={field.onChange} invalid={Boolean(errors.location)} />
                )}
              />
              <FieldError
                errors={[
                  message(
                    errors.location?.latitude ??
                      errors.location?.label ??
                      (errors.location ? { message: "locationRequired" } : undefined),
                  ),
                ]}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.sourceUrl)}>
                <FieldLabel htmlFor="report-source">{t("sourceUrl")}</FieldLabel>
                <Input id="report-source" type="url" inputMode="url" placeholder="https://" {...form.register("sourceUrl")} />
                <FieldError errors={[message(errors.sourceUrl)]} />
              </Field>
              <Field data-invalid={Boolean(errors.imageUrl)}>
                <FieldLabel htmlFor="report-image">{t("imageUrl")}</FieldLabel>
                <Input id="report-image" type="url" inputMode="url" placeholder="https://" {...form.register("imageUrl")} />
                <FieldError errors={[message(errors.imageUrl)]} />
              </Field>
            </div>

            <Controller
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <Field orientation="horizontal" data-invalid={Boolean(errors.confirm)} className="items-start rounded-xl border bg-muted/40 p-3">
                  <Checkbox
                    id="report-confirm"
                    checked={field.value === true}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="flex flex-col gap-1">
                    <FieldLabel htmlFor="report-confirm" className="font-normal leading-snug">
                      {t("confirm")}
                    </FieldLabel>
                    <FieldError errors={[message(errors.confirm)]} />
                  </div>
                </Field>
              )}
            />

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              {t("privacyNote")}
            </p>
          </FieldGroup>

          <DialogFooter className="sticky bottom-0 border-t bg-background/95 p-4 backdrop-blur">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
