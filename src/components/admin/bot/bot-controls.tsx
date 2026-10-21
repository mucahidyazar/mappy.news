"use client";

import { Loader2, Pause, Play, Radar } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { scanNow, setBotEnabled } from "@/server/actions/admin-bot";

export function BotControls({ enabled, canManage }: { enabled: boolean; canManage: boolean }) {
  const t = useTranslations("admin.bot");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setBotEnabled(!enabled);
      if (!result.ok) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(enabled ? t("paused") : t("resumed"));
      router.refresh();
    });
  }

  function scan() {
    startTransition(async () => {
      const result = await scanNow();
      if (!result.ok) toast.error(tErrors(result.error));
      else toast.success(t("scanRequested"));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={scan} disabled={pending || !enabled} className="gap-1.5">
        {pending ? <Loader2 className="animate-spin" /> : <Radar className="size-4" />}
        {t("scanNow")}
      </Button>
      {canManage ? (
        <Button onClick={toggle} disabled={pending} variant={enabled ? "outline" : "default"} className="gap-1.5">
          {enabled ? <Pause className="size-4" /> : <Play className="size-4" />}
          {enabled ? t("pause") : t("resume")}
        </Button>
      ) : null}
    </div>
  );
}
