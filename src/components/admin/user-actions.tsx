"use client";

import { Ban, History, KeyRound, Loader2, MoreHorizontal, ShieldCheck, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { USER_ROLES } from "@/lib/domain/constants";
import type { ActionResult } from "@/lib/actions";
import { banUser, revokeUserSessions, setUserRole, unbanUser } from "@/server/actions/admin-moderation";

import { RelativeTime } from "../news/relative-time";

const DURATIONS = [
  { key: "1d", hours: 24 },
  { key: "7d", hours: 24 * 7 },
  { key: "30d", hours: 24 * 30 },
  { key: "permanent", hours: null },
] as const;

export interface BanHistoryEntry {
  id: string;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  liftedAt: string | null;
  bannedByName: string | null;
}

export function UserActions({
  target,
  isSelf,
  history,
}: {
  target: { id: string; name: string; role: string; banned: boolean };
  isSelf: boolean;
  history: BanHistoryEntry[];
}) {
  const t = useTranslations("admin.users");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banOpen, setBanOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]["key"]>("7d");

  function run(task: () => Promise<ActionResult<unknown>>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast.error(result.message === "self" ? t("notSelf") : tErrors(result.error));
        return;
      }
      toast.success(success);
      after?.();
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("actions")} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" /> {t("role")}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={target.role}
            onValueChange={(role) => !isSelf && run(() => setUserRole({ userId: target.id, role }), t("roleChanged"))}
          >
            {USER_ROLES.map((role) => (
              <DropdownMenuRadioItem key={role} value={role} disabled={isSelf}>
                {t(`roles.${role}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          {target.banned ? (
            <DropdownMenuItem onSelect={() => run(() => unbanUser(target.id), t("unbanned"))}>
              <Undo2 /> {t("unban")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" disabled={isSelf} onSelect={() => setBanOpen(true)}>
              <Ban /> {t("ban")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => run(() => revokeUserSessions(target.id), t("sessionsRevoked"))}>
            <KeyRound /> {t("revokeSessions")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
            <History /> {t("history", { count: history.length })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={banOpen} onOpenChange={setBanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("banTitle", { name: target.name })}</DialogTitle>
            <DialogDescription>{t("banDescription")}</DialogDescription>
          </DialogHeader>
          <Select value={duration} onValueChange={(value) => setDuration(value as typeof duration)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {t(`durations.${item.key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={300} placeholder={t("reasonPlaceholder")} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBanOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={pending || reason.trim().length < 3}
              onClick={() =>
                run(
                  () => banUser({ userId: target.id, reason, hours: DURATIONS.find((item) => item.key === duration)?.hours ?? null }),
                  t("banned"),
                  () => {
                    setBanOpen(false);
                    setReason("");
                  },
                )
              }
            >
              {t("ban")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("historyTitle", { name: target.name })}</DialogTitle>
          </DialogHeader>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
          ) : (
            <ul className="space-y-3">
              {history.map((entry) => (
                <li key={entry.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{entry.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <RelativeTime value={entry.createdAt} /> · {entry.bannedByName ?? "—"} ·{" "}
                    {entry.expiresAt ? t("until", { date: new Date(entry.expiresAt).toLocaleString() }) : t("durations.permanent")}
                    {entry.liftedAt ? ` · ${t("lifted")}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
