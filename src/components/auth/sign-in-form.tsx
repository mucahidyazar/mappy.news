"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useValidationMessage } from "@/components/forms/use-validation-message";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";

import { OrDivider } from "./auth-card";
import { GoogleButton } from "./google-button";

const schema = z.object({
  email: z.email({ error: "email" }),
  password: z.string().min(1, { error: "passwordRequired" }),
});

type Values = z.infer<typeof schema>;

export function SignInForm({ next, googleEnabled, initialError }: { next: string; googleEnabled: boolean; initialError?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const message = useValidationMessage();
  const [error, setError] = useState<string | null>(initialError === "oauth" ? t("googleFailed") : null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: Values) {
    setError(null);
    setNeedsVerification(false);
    const { error: signInError } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      rememberMe: true,
      // Better Auth navigates here after signing in (and links verification emails sent on sign-in here).
      callbackURL: next,
    });
    if (!signInError) {
      router.replace(next);
      router.refresh();
      return;
    }
    if (signInError.code === "EMAIL_NOT_VERIFIED") {
      setNeedsVerification(true);
      return;
    }
    if (signInError.code === "BANNED_USER") {
      setError(t("banned"));
      return;
    }
    if (signInError.status === 429) {
      setError(t("tooManyAttempts"));
      return;
    }
    setError(signInError.code === "INVALID_EMAIL_OR_PASSWORD" ? t("invalidCredentials") : t("genericError"));
  }

  return (
    <div className="flex flex-col gap-4">
      {googleEnabled ? (
        <>
          <GoogleButton next={next} />
          <OrDivider label={t("orWithEmail")} />
        </>
      ) : null}

      {needsVerification ? (
        <Alert>
          <MailCheck />
          <AlertDescription>{t("verifyFirst")}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup className="gap-4">
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
            <Input id="email" type="email" autoComplete="email" inputMode="email" {...form.register("email")} aria-invalid={Boolean(errors.email)} />
            <FieldError errors={[message(errors.email)]} />
          </Field>
          <Field data-invalid={Boolean(errors.password)}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
              <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                {t("forgotPassword")}
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...form.register("password")}
              aria-invalid={Boolean(errors.password)}
            />
            <FieldError errors={[message(errors.password)]} />
          </Field>
          <Button type="submit" className="h-11" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            {t("signIn")}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
