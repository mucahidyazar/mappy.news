"use client";

import { Loader2, Radar, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { deleteSource, scanNow, toggleSource } from "@/server/actions/admin-bot";

export function SourceSwitch({ id, field, value, label, disabled }: { id: string; field: "isActive" | "autoPublish"; value: boolean; label: string; disabled?: boolean }) {
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={value}
      disabled={pending || disabled}
      aria-label={label}
      onCheckedChange={(checked) =>
        startTransition(async () => {
          const result = await toggleSource({ id, field, value: checked });
          if (!result.ok) toast.error(tErrors(result.error));
          router.refresh();
        })
      }
    />
  );
}

export function SourceRowActions({ id, name, canManage }: { id: string; name: string; canManage: boolean }) {
  const t = useTranslations("admin.sources");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<ActionResult<unknown>>, success: string) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={() => run(() => scanNow(id), t("pollQueued"))} disabled={pending} aria-label={t("pollNow")}>
            {pending ? <Loader2 className="animate-spin" /> : <Radar />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("pollNow")}</TooltipContent>
      </Tooltip>
      {canManage ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={t("delete")}>
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle", { name })}</AlertDialogTitle>
              <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => run(() => deleteSource(id), t("deleted"))}>
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
