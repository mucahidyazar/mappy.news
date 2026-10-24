import { AlertTriangle, ArrowRight, Bot, CircleCheck, Copy, Filter, Inbox, MapPinned, Rss, Send, Sparkles, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { BotControls } from "@/components/admin/bot/bot-controls";
import { LiveFeed } from "@/components/admin/bot/live-feed";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { RelativeTime } from "@/components/news/relative-time";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { aiKeysFromEnv, configuredProviders } from "@/lib/bot/ai";
import { autoPublishActive } from "@/lib/bot/settings";
import { cn } from "@/lib/utils";
import { getBotOverview, listRecentEvents } from "@/server/admin/bot";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.bot" });
  return { title: t("title") };
}

export default async function BotPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const viewer = await requirePermission("bot.view");
  const t = await getTranslations("admin.bot");
  const tSettings = await getTranslations("admin.botSettings");
  const format = await getFormatter();
  const [overview, events] = await Promise.all([getBotOverview(), listRecentEvents(60)]);
  const { settings, worker, today } = overview;
  const providers = configuredProviders(aiKeysFromEnv());
  const aiReady = providers[settings.ai.provider];
  const providerName = tSettings(`providers.${settings.ai.provider}`);
  const aiPause = worker?.online && worker.aiPause && new Date(worker.aiPause.until) > new Date() ? worker.aiPause : null;
  const xReady = Boolean(process.env.X_BEARER_TOKEN);
  const spendRatio = settings.ai.dailyBudgetUsd > 0 ? Math.min(1, today.cost / settings.ai.dailyBudgetUsd) : 0;
  const autoPublishing = autoPublishActive(settings);

  const workerState = !worker ? "never" : !worker.online ? "offline" : !settings.enabled ? "paused" : worker.state;
  const stateTone =
    workerState === "offline" || workerState === "never"
      ? "bg-destructive"
      : workerState === "paused" || workerState === "waiting_lock"
        ? "bg-warning"
        : "bg-success";

  const steps = [
    { icon: Rss, label: t("steps.collect"), value: today.collected },
    { icon: Filter, label: t("steps.screen"), value: today.screened, muted: true },
    { icon: Sparkles, label: t("steps.analyze"), value: today.aiCalls },
    { icon: XCircle, label: t("steps.rejected"), value: today.rejected, muted: true },
    { icon: Copy, label: t("steps.duplicate"), value: today.duplicate, muted: true },
    { icon: Inbox, label: t("steps.queued"), value: today.queued },
    { icon: Send, label: t("steps.published"), value: today.published },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} actions={<BotControls enabled={settings.enabled} canManage={can(viewer.role, "bot.manage")} />} />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-4 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span className={cn("size-2.5 rounded-full", stateTone, workerState !== "offline" && workerState !== "never" && "animate-pulse")} />
          {t(`state.${workerState}`)}
        </span>
        {worker ? (
          <span className="text-xs text-muted-foreground">
            {t("heartbeat")} <RelativeTime value={worker.heartbeatAt} /> · {worker.host} · v{worker.version}
          </span>
        ) : null}
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
        <Badge variant="outline">{settings.enabled ? t("enabled") : t("disabled")}</Badge>
        {settings.dryRun ? <Badge variant="outline" className="border-warning/50 bg-warning/10">{t("dryRun")}</Badge> : null}
        <Badge variant="outline" className={autoPublishing ? "border-success/50 bg-success/10" : undefined}>
          {t(`autoPublish.${autoPublishing ? settings.autoPublish.mode : "off"}`)}
        </Badge>
        <Badge variant="outline">{t(`merge.${settings.merge.auto ? "ai" : "rule"}`)}</Badge>
        <Badge variant="outline" className={aiReady ? undefined : "border-destructive/50 text-destructive"}>
          <Bot className="size-3" /> {providerName} · {settings.ai.model}
        </Badge>
        <Badge variant="outline" className={xReady ? undefined : "text-muted-foreground"}>
          X {xReady ? t("configured") : t("notConfigured")}
        </Badge>
        <Link href="/admin/bot/settings" className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {t("settingsLink")} <ArrowRight className="size-3" />
        </Link>
      </div>

      {workerState === "offline" || workerState === "never" ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("offlineTitle")}</AlertTitle>
          <AlertDescription>{t("offlineDescription")}</AlertDescription>
        </Alert>
      ) : null}
      {!aiReady ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("noKeyTitle")}</AlertTitle>
          <AlertDescription>{t("noKeyDescription", { provider: providerName })}</AlertDescription>
        </Alert>
      ) : null}
      {aiReady && aiPause ? (
        <Alert variant={aiPause.kind === "rate_limit" ? "default" : "destructive"}>
          <AlertTriangle />
          <AlertTitle>{t(`aiPause.${aiPause.kind}`, { provider: tSettings(`providers.${aiPause.provider}`) })}</AlertTitle>
          <AlertDescription>
            <p>{t("aiPause.description", { until: format.dateTime(new Date(aiPause.until), { timeStyle: "short" }) })}</p>
            <p className="mt-1 font-mono text-xs break-all">{aiPause.message}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      {spendRatio >= 1 ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>{t("budgetTitle")}</AlertTitle>
          <AlertDescription>{t("budgetDescription")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("kpi.collected")} value={today.collected} hint={t("kpi.waiting", { count: today.waiting })} icon={<Rss />} />
        <StatCard
          label={t("kpi.stories")}
          value={today.queued + today.published}
          hint={t("kpi.storiesHint", { queued: today.queued, published: today.published })}
          icon={<CircleCheck />}
        />
        <StatCard
          label={t("kpi.spend")}
          value={`$${today.cost.toFixed(3)}`}
          hint={
            <span className="block space-y-1.5">
              <Progress value={spendRatio * 100} className="h-1.5" />
              {t("kpi.budget", { budget: settings.ai.dailyBudgetUsd.toFixed(2), calls: today.aiCalls })}
            </span>
          }
          icon={<Sparkles />}
        />
        <StatCard
          label={t("kpi.sources")}
          value={overview.activeSources}
          hint={overview.failingSources ? t("kpi.failing", { count: overview.failingSources }) : t("kpi.xReads", { reads: today.xReads, limit: settings.x.dailyReadLimit })}
          icon={<MapPinned />}
        />
      </div>

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{t("pipelineToday")}</h2>
        <ol className="flex flex-wrap items-center gap-2">
          {steps.map((step, index) => (
            <li key={step.label} className="flex items-center gap-2">
              <span className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm", step.muted && "text-muted-foreground")}>
                <step.icon className="size-4" />
                {step.label}
                <span className="font-semibold tabular-nums text-foreground">{step.value}</span>
              </span>
              {index < steps.length - 1 ? <ArrowRight className="size-3.5 text-muted-foreground" /> : null}
            </li>
          ))}
        </ol>
        {overview.backlog.failedTotal ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("failedBacklog", { count: overview.backlog.failedTotal })}{" "}
            <Link href={{ pathname: "/admin/bot/items", query: { status: "failed" } }} className="underline underline-offset-4">
              {t("seeFailed")}
            </Link>
          </p>
        ) : null}
      </section>

      <LiveFeed initial={events} />
    </div>
  );
}
