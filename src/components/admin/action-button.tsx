"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ComponentProps, type ReactNode, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";

/** Runs a server action, reports the outcome with a toast and refreshes the page data. */
export function ActionButton({
  action,
  success,
  errorMessages,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "action"> & {
  action: () => Promise<ActionResult<unknown>>;
  success: string;
  /** Messages for specific `ActionError` details, keyed by the error's message. */
  errorMessages?: Record<string, string>;
  children: ReactNode;
}) {
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={() =>
        startTransition(async () => {
          const result = await action();
          if (!result.ok) {
            toast.error((result.message && errorMessages?.[result.message]) || tErrors(result.error));
            return;
          }
          toast.success(success);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}
