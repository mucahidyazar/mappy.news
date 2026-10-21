"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export function SearchField({
  value,
  onChange,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  const t = useTranslations("explorer");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <label
      className={cn(
        "group flex h-10 items-center gap-2 rounded-xl border border-border bg-background/70 px-3 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">{t("searchLabel")}</span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onChange("");
            event.currentTarget.blur();
          }
        }}
        placeholder={t("searchPlaceholder")}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        maxLength={80}
        enterKeyHint="search"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={t("clearSearch")}
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <Kbd className="hidden lg:inline-flex">⌘K</Kbd>
      )}
    </label>
  );
}
