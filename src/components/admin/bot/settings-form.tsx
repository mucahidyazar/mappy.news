"use client";

import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { RelativeTime } from "@/components/news/relative-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { AI_EFFORTS, AI_PROVIDERS, AUTO_PUBLISH_MODES, type AiEffort, type AiProvider, type BotSettings, MODEL_CATALOG } from "@/lib/bot/settings";
import { saveBotSettings } from "@/server/actions/admin-bot";

const DURATIONS = [
  { key: "none", hours: null },
  { key: "1h", hours: 1 },
  { key: "6h", hours: 6 },
  { key: "24h", hours: 24 },
  { key: "72h", hours: 72 },
  { key: "7d", hours: 168 },
] as const;

function Percent({ value }: { value: number }) {
  return <span className="text-sm font-medium tabular-nums">{Math.round(value * 100)}%</span>;
}

export function BotSettingsForm({ initial, providers, xConfigured }: { initial: BotSettings; providers: Record<AiProvider, boolean>; xConfigured: boolean }) {
  const t = useTranslations("admin.botSettings");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [settings, setSettings] = useState<BotSettings>(initial);
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]["key"] | "keep">(initial.autoPublish.until ? "keep" : "none");
  const [pending, startTransition] = useTransition();

  function patch<K extends keyof BotSettings>(key: K, value: Partial<BotSettings[K]> | BotSettings[K]) {
    setSettings((current) => ({
      ...current,
      [key]: typeof value === "object" && value !== null && !Array.isArray(value) ? { ...(current[key] as object), ...value } : value,
    }));
  }

  /** A model from the catalog brings its list prices along; a typed-in id keeps the current prices. */
  function chooseModel(provider: AiProvider, model: string) {
    const known = MODEL_CATALOG[provider].find((entry) => entry.id === model);
    patch("ai", {
      provider,
      model,
      ...(known?.input != null && known.output != null ? { inputPricePerMillion: known.input, outputPricePerMillion: known.output } : {}),
    });
  }

  function submit() {
    const chosen = DURATIONS.find((item) => item.key === duration);
    const until =
      duration === "keep" ? settings.autoPublish.until : chosen?.hours ? new Date(Date.now() + chosen.hours * 3600 * 1000).toISOString() : null;
    startTransition(async () => {
      const result = await saveBotSettings({ ...settings, autoPublish: { ...settings.autoPublish, until } });
      if (!result.ok) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(t("saved"));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("general")}</CardTitle>
          <CardDescription>{t("generalDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={settings.enabled} onCheckedChange={(enabled) => patch("enabled", enabled)} className="mt-0.5" />
            <span>
              {t("enabled")}
              <span className="block text-xs text-muted-foreground">{t("enabledHint")}</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={settings.dryRun} onCheckedChange={(dryRun) => patch("dryRun", dryRun)} className="mt-0.5" />
            <span>
              {t("dryRun")}
              <span className="block text-xs text-muted-foreground">{t("dryRunHint")}</span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("ai")}</CardTitle>
          <CardDescription>{t("aiDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("provider")}</FieldLabel>
                <Select value={settings.ai.provider} onValueChange={(provider) => chooseModel(provider as AiProvider, MODEL_CATALOG[provider as AiProvider][0]?.id ?? settings.ai.model)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.map((provider) => (
                      <SelectItem key={provider} value={provider} disabled={!providers[provider] && provider !== settings.ai.provider}>
                        {t(`providers.${provider}`)}
                        {providers[provider] ? (
                          <Check className="size-3.5 text-success" />
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("keyMissingOption")}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!providers[settings.ai.provider] ? <FieldDescription className="text-destructive">{t("missingKey")}</FieldDescription> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-model">{t("model")}</FieldLabel>
                <Input id="ai-model" list="ai-models" value={settings.ai.model} onChange={(event) => chooseModel(settings.ai.provider, event.target.value)} />
                <datalist id="ai-models">
                  {MODEL_CATALOG[settings.ai.provider].map((model) => (
                    <option key={model.id} value={model.id} />
                  ))}
                </datalist>
              </Field>
            </div>
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{t("noFallback")}</p>
            <Field>
              <FieldLabel>{t("effort")}</FieldLabel>
              <Select value={settings.ai.effort} onValueChange={(effort) => patch("ai", { effort: effort as AiEffort })}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_EFFORTS.map((effort) => (
                    <SelectItem key={effort} value={effort}>
                      {t(`efforts.${effort}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t("effortHint")}</FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="ai-budget">{t("dailyBudget")}</FieldLabel>
                <Input id="ai-budget" type="number" step="0.5" min={0} max={200} value={settings.ai.dailyBudgetUsd} onChange={(event) => patch("ai", { dailyBudgetUsd: Number(event.target.value) || 0 })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-input">{t("inputPrice")}</FieldLabel>
                <Input id="ai-input" type="number" step="0.01" min={0} value={settings.ai.inputPricePerMillion} onChange={(event) => patch("ai", { inputPricePerMillion: Number(event.target.value) || 0 })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-output">{t("outputPrice")}</FieldLabel>
                <Input id="ai-output" type="number" step="0.01" min={0} value={settings.ai.outputPricePerMillion} onChange={(event) => patch("ai", { outputPricePerMillion: Number(event.target.value) || 0 })} />
              </Field>
            </div>
            <FieldDescription>{t("priceHint")}</FieldDescription>
            <Field>
              <FieldLabel htmlFor="ai-concurrency">{t("concurrency")}</FieldLabel>
              <Input id="ai-concurrency" type="number" min={1} max={8} value={settings.ai.concurrency} onChange={(event) => patch("ai", { concurrency: Math.min(8, Math.max(1, Number(event.target.value) || 1)) })} className="w-24" />
              <FieldDescription>{t("concurrencyHint")}</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("review")}</CardTitle>
          <CardDescription>{t("reviewDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-5">
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel>{t("minScore")}</FieldLabel>
                <Percent value={settings.review.minScore} />
              </div>
              <Slider min={0} max={1} step={0.05} value={[settings.review.minScore]} onValueChange={([value]) => patch("review", { minScore: value ?? 0 })} />
              <FieldDescription>{t("minScoreHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="max-age">{t("maxAge")}</FieldLabel>
              <Input id="max-age" type="number" min={1} max={336} value={settings.review.maxAgeHours} onChange={(event) => patch("review", { maxAgeHours: Number(event.target.value) || 48 })} className="w-28" />
            </Field>
            <label className="flex items-start gap-3 text-sm">
              <Switch checked={settings.review.keywordPrefilter} onCheckedChange={(keywordPrefilter) => patch("review", { keywordPrefilter })} className="mt-0.5" />
              <span>
                {t("prefilter")}
                <span className="block text-xs text-muted-foreground">{t("prefilterHint")}</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <Switch checked={settings.review.readArticles} onCheckedChange={(readArticles) => patch("review", { readArticles })} className="mt-0.5" />
              <span>
                {t("readArticles")}
                <span className="block text-xs text-muted-foreground">{t("readArticlesHint")}</span>
              </span>
            </label>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("autoPublish")}</CardTitle>
          <CardDescription>{t("autoPublishDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-5">
            <RadioGroup value={settings.autoPublish.mode} onValueChange={(mode) => patch("autoPublish", { mode: mode as BotSettings["autoPublish"]["mode"] })}>
              {AUTO_PUBLISH_MODES.map((mode) => (
                <label key={mode} className="flex items-start gap-3 text-sm">
                  <RadioGroupItem value={mode} className="mt-0.5" />
                  <span>
                    {t(`modes.${mode}`)}
                    <span className="block text-xs text-muted-foreground">{t(`modes.${mode}Hint`)}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {settings.autoPublish.mode !== "off" ? (
              <>
                <Field>
                  <FieldLabel>{t("duration")}</FieldLabel>
                  <Select value={duration} onValueChange={(value) => setDuration(value as typeof duration)}>
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {initial.autoPublish.until ? <SelectItem value="keep">{t("keepUntil")}</SelectItem> : null}
                      {DURATIONS.map((item) => (
                        <SelectItem key={item.key} value={item.key}>
                          {t(`durations.${item.key}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {initial.autoPublish.until ? (
                    <FieldDescription>
                      {t("expires")} <RelativeTime value={initial.autoPublish.until} />
                    </FieldDescription>
                  ) : null}
                </Field>
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel>{t("autoMinScore")}</FieldLabel>
                    <Percent value={settings.autoPublish.minScore} />
                  </div>
                  <Slider min={0.5} max={1} step={0.05} value={[settings.autoPublish.minScore]} onValueChange={([value]) => patch("autoPublish", { minScore: value ?? 0.75 })} />
                </Field>
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel>{t("autoMinLocation")}</FieldLabel>
                    <Percent value={settings.autoPublish.minLocationConfidence} />
                  </div>
                  <Slider min={0.3} max={1} step={0.05} value={[settings.autoPublish.minLocationConfidence]} onValueChange={([value]) => patch("autoPublish", { minLocationConfidence: value ?? 0.75 })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="auto-limit">{t("dailyLimit")}</FieldLabel>
                  <Input id="auto-limit" type="number" min={0} max={1000} value={settings.autoPublish.dailyLimit} onChange={(event) => patch("autoPublish", { dailyLimit: Number(event.target.value) || 0 })} className="w-28" />
                </Field>
                <label className="flex items-start gap-3 text-sm">
                  <Switch checked={settings.autoPublish.allowSensitive} onCheckedChange={(allowSensitive) => patch("autoPublish", { allowSensitive })} className="mt-0.5" />
                  <span>
                    {t("allowSensitive")}
                    <span className="block text-xs text-muted-foreground">{t("allowSensitiveHint")}</span>
                  </span>
                </label>
              </>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">X (Twitter)</CardTitle>
          <CardDescription>{xConfigured ? t("xConfigured") : t("xMissing")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="x-limit">{t("xLimit")}</FieldLabel>
            <Input id="x-limit" type="number" min={0} max={20000} value={settings.x.dailyReadLimit} onChange={(event) => patch("x", { dailyReadLimit: Number(event.target.value) || 0 })} className="w-32" />
            <FieldDescription>{t("xLimitHint")}</FieldDescription>
          </Field>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex justify-end xl:col-span-2">
        <Button onClick={submit} disabled={pending} className="shadow-lg">
          {pending ? <Loader2 className="animate-spin" /> : null}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
