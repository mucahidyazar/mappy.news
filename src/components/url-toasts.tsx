"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";

/** Shows one-off notices carried in the URL (e.g. ?verified=1 after the email link) and removes the flag. */
export function UrlToasts() {
  const t = useTranslations("auth");
  const params = useSearchParams();

  useEffect(() => {
    if (params.get("verified") !== "1") return;
    toast.success(t("emailVerified"));
    const url = new URL(window.location.href);
    url.searchParams.delete("verified");
    window.history.replaceState(window.history.state, "", url);
  }, [params, t]);

  return null;
}
