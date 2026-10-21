"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { useValidationMessage } from "@/components/forms/use-validation-message";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";

import { OrDivider } from "./auth-card";
import { GoogleButton } from "./google-button";

const schema = z.object({
  name: z.string().trim().min(2, { error: "nameTooShort" }).max(60, { error: "tooLong" }),
  email: z.email({ error: "email" }),
  password: z.string().min(8, { error: "passwordTooShort" }).max(128, { error: "tooLong" }),
  terms: z.literal(true, { error: "termsRequired" }),
});

type Values = z.input<typeof schema>;

export function SignUpForm({ next, googleEnabled }: { next: string; googleEnabled: boolean }) {
  const t = useTranslations("auth");
  const message = useValidationMessage();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", terms: false as unknown as true },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: Values) {
    setError(null);
    const { error: signUpError } = await authClient.signUp.email({
      name: values.name.trim(),
      email: values.email,
      password: values.password,
      callbackURL: `${next}${next.includes("?") ? "&" : "?"}verified=1`,
    });
    if (signUpError) {
      if (signUpError.status === 429) setError(t("tooManyAttempts"));
      else if (signUpError.code === "USER_ALREADY_EXISTS") setError(t("emailTaken"));
      else if (signUpError.code === "PASSWORD_TOO_SHORT") setError(t("passwordTooShort"));
      else setError(t("genericError"));
      return;
    }
    setSentTo(values.email);
  }

  async function resend() {
    if (!sentTo) return;
    await authClient.sendVerificationEmail({ email: sentTo, callbackURL: `${next}${next.includes("?") ? "&" : "?"}verified=1` });
  }

  if (sentTo) {
    return (
      <Alert>
        <MailCheck />
        <AlertTitle>{t("checkInboxTitle")}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{t("checkInboxDescription", { email: sentTo })}</p>
          <Button variant="outline" size="sm" onClick={() => void resend()}>
            {t("resendVerification")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {googleEnabled ? (
        <>
          <GoogleButton next={next} />
          <OrDivider label={t("orWithEmail")} />
        </>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup className="gap-4">
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
            <Input id="name" autoComplete="name" {...form.register("name")} aria-invalid={Boolean(errors.name)} />
            <FieldDescription>{t("nameHint")}</FieldDescription>
            <FieldError errors={[message(errors.name)]} />
          </Field>
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
            <Input id="email" type="email" autoComplete="email" inputMode="email" {...form.register("email")} aria-invalid={Boolean(errors.email)} />
            <FieldError errors={[message(errors.email)]} />
          </Field>
          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
            <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} aria-invalid={Boolean(errors.password)} />
            <FieldDescription>{t("passwordHint")}</FieldDescription>
            <FieldError errors={[message(errors.password)]} />
          </Field>
          <Controller
            control={form.control}
            name="terms"
            render={({ field }) => (
              <Field orientation="horizontal" data-invalid={Boolean(errors.terms)} className="items-start">
                <Checkbox id="terms" checked={field.value === true} onCheckedChange={(checked) => field.onChange(checked === true)} className="mt-0.5" />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="terms" className="leading-snug font-normal">
                    {t.rich("acceptTerms", {
                      terms: (chunks) => (
                        <Link href="/terms" className="underline underline-offset-4" target="_blank">
                          {chunks}
                        </Link>
                      ),
                      privacy: (chunks) => (
                        <Link href="/privacy" className="underline underline-offset-4" target="_blank">
                          {chunks}
                        </Link>
                      ),
                    })}
                  </FieldLabel>
                  <FieldError errors={[message(errors.terms)]} />
                </div>
              </Field>
            )}
          />
          <Button type="submit" className="h-11" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            {t("createAccount")}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
