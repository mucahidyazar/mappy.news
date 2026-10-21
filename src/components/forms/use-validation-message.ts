"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { FieldError } from "react-hook-form";

import { translateDynamic } from "@/i18n/dynamic";

/** Zod messages in this app are keys under `validation.*`; unknown messages fall back to a generic one. */
export function useValidationMessage() {
  const t = useTranslations("validation");
  return useCallback(
    (error: FieldError | { message?: string } | undefined): { message: string } | undefined => {
      if (!error?.message) return error ? { message: t("invalid") } : undefined;
      return { message: translateDynamic(t, error.message) ?? t("invalid") };
    },
    [t],
  );
}
