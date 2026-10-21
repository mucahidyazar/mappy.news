"use client";

import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { usePathname, useRouter } from "@/i18n/navigation";

const ALL = "__all__";

export interface FilterSelect {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

/** Search box and selects that write to the URL; the server page reads them as search params. */
export function UrlFilters({ searchPlaceholder, selects = [] }: { searchPlaceholder?: string; selects?: FilterSelect[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    const search = next.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname));
  }

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;
    const timer = window.setTimeout(() => update({ q: query.trim() || null }), 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {searchPlaceholder !== undefined ? (
        <label className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} className="pl-8" aria-label={searchPlaceholder} />
        </label>
      ) : null}
      {selects.map((select) => (
        <Select key={select.name} value={params.get(select.name) ?? ALL} onValueChange={(value) => update({ [select.name]: value === ALL ? null : value })}>
          <SelectTrigger className="w-44" aria-label={select.label}>
            <SelectValue placeholder={select.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{select.label}</SelectItem>
            {select.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {pending ? <Spinner className="size-4 text-muted-foreground" /> : null}
    </div>
  );
}
