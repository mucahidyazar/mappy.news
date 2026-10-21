"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";

export function ProfileSettings({ name, hasPassword }: { name: string; hasPassword: boolean }) {
  const t = useTranslations("profile.settings");
  const router = useRouter();
  const [displayName, setDisplayName] = useState(name);
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function saveName() {
    const value = displayName.trim();
    if (value.length < 2 || value.length > 60) {
      toast.error(t("nameInvalid"));
      return;
    }
    setSavingName(true);
    const { error } = await authClient.updateUser({ name: value });
    setSavingName(false);
    if (error) toast.error(t("saveFailed"));
    else {
      toast.success(t("saved"));
      router.refresh();
    }
  }

  async function changePassword() {
    if (newPassword.length < 8) {
      toast.error(t("passwordTooShort"));
      return;
    }
    setSavingPassword(true);
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    setSavingPassword(false);
    if (error) {
      toast.error(error.code === "INVALID_PASSWORD" ? t("wrongPassword") : t("saveFailed"));
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    toast.success(t("passwordChanged"));
  }

  async function deleteAccount() {
    setDeleting(true);
    const { error } = await authClient.deleteUser(hasPassword ? { password: deletePassword } : {});
    setDeleting(false);
    if (error) {
      toast.error(error.code === "SESSION_EXPIRED" ? t("reauthenticate") : t("deleteFailed"));
      return;
    }
    toast.success(t("deleted"));
    router.replace("/");
    router.refresh();
  }

  async function signOutEverywhere() {
    const { error } = await authClient.revokeOtherSessions();
    if (error) toast.error(t("saveFailed"));
    else toast.success(t("sessionsRevoked"));
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("nameTitle")}</CardTitle>
          <CardDescription>{t("nameDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} aria-label={t("nameTitle")} />
          <Button onClick={saveName} disabled={savingName || displayName.trim() === name}>
            {savingName ? <Loader2 className="animate-spin" /> : null}
            {t("save")}
          </Button>
        </CardContent>
      </Card>

      {hasPassword ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("passwordTitle")}</CardTitle>
            <CardDescription>{t("passwordDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor="current-password">{t("currentPassword")}</FieldLabel>
                <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-password">{t("newPassword")}</FieldLabel>
                <Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </Field>
              <Button onClick={changePassword} disabled={savingPassword || !currentPassword || !newPassword} className="self-start">
                {savingPassword ? <Loader2 className="animate-spin" /> : null}
                {t("changePassword")}
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("sessionsTitle")}</CardTitle>
          <CardDescription>{t("sessionsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void signOutEverywhere()}>
            {t("revokeSessions")}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">{t("deleteTitle")}</CardTitle>
          <CardDescription>{t("deleteDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">{t("deleteAction")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("deleteConfirmDescription")}</AlertDialogDescription>
              </AlertDialogHeader>
              {hasPassword ? (
                <Input
                  type="password"
                  autoComplete="current-password"
                  placeholder={t("currentPassword")}
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    void deleteAccount();
                  }}
                  disabled={deleting || (hasPassword && !deletePassword)}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {deleting ? <Loader2 className="animate-spin" /> : null}
                  {t("deleteConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
