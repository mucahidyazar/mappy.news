"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useValidationMessage } from "@/components/forms/use-validation-message";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { authClient } from "@/lib/auth/client";
import { localizedPath } from "@/lib/site";

const emailSchema = z.object({ email: z.email({ error: "email" }) });

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale() as Locale;
  const message = useValidationMessage();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof emailSchema>>({ resolver: zodResolver(emailSchema), defaultValues: { email: "" } });

  async function onSubmit({ email }: z.infer<typeof emailSchema>) {
    setError(null);
    const { error: requestError } = await authClient.requestPasswordReset({
      email,
      redirectTo: localizedPath("/reset-password", locale),
    });
    if (requestError?.status === 429) {
      setError(t("tooManyAttempts"));
      return;
    }
    // Same answer whether or not the address has an account.
    setSent(true);
  }

  if (sent) {
    return (
      <Alert>
        <MailCheck />
        <AlertTitle>{t("resetSentTitle")}</AlertTitle>
        <AlertDescription>{t("resetSentDescription")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup className="gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={Boolean(form.formState.errors.email)}>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
          <FieldError errors={[message(form.formState.errors.email)]} />
        </Field>
        <Button type="submit" className="h-11" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {t("sendResetLink")}
        </Button>
      </FieldGroup>
    </form>
  );
}

const resetSchema = z
  .object({
    password: z.string().min(8, { error: "passwordTooShort" }).max(128, { error: "tooLong" }),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, { error: "passwordMismatch", path: ["confirm"] });

export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations("auth");
  const message = useValidationMessage();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : t("invalidResetLink"));
  const form = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit({ password }: z.infer<typeof resetSchema>) {
    if (!token) return;
    setError(null);
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
    if (resetError) {
      setError(resetError.code === "INVALID_TOKEN" ? t("invalidResetLink") : t("genericError"));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>{t("resetDoneTitle")}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{t("resetDoneDescription")}</p>
          <Button asChild size="sm">
            <Link href="/sign-in">{t("signIn")}</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup className="gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">{t("newPassword")}</FieldLabel>
          <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} disabled={!token} />
          <FieldError errors={[message(errors.password)]} />
        </Field>
        <Field data-invalid={Boolean(errors.confirm)}>
          <FieldLabel htmlFor="confirm">{t("confirmPassword")}</FieldLabel>
          <Input id="confirm" type="password" autoComplete="new-password" {...form.register("confirm")} disabled={!token} />
          <FieldError errors={[message(errors.confirm)]} />
        </Field>
        <Button type="submit" className="h-11" disabled={isSubmitting || !token}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {t("setNewPassword")}
        </Button>
      </FieldGroup>
    </form>
  );
}
