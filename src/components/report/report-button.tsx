"use client";

import { Megaphone } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSession } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

const ReportDialog = dynamic(() => import("./report-dialog").then((module) => module.ReportDialog), { ssr: false });

/** Opens the report form; visitors are sent to sign in first and come back with the form open (?report=1). */
export function ReportButton({ className }: { className?: string }) {
  const t = useTranslations("report");
  const { data, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  // Back from sign-in with ?report=1: the form stays open until it's closed, which also drops the flag.
  const requested = searchParams.get("report") === "1" && Boolean(data?.user);
  const isOpen = open || requested;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next && requested) {
      const url = new URL(window.location.href);
      url.searchParams.delete("report");
      window.history.replaceState(null, "", url);
    }
  }

  function handleClick() {
    if (!data?.user) {
      router.push({ pathname: "/sign-in", query: { next: `${pathname}?report=1` } });
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <Button onClick={handleClick} disabled={isPending} className={cn("gap-1.5", className)}>
        <Megaphone className="size-4" />
        {t("cta")}
      </Button>
      {isOpen ? <ReportDialog open={isOpen} onOpenChange={handleOpenChange} /> : null}
    </>
  );
}
