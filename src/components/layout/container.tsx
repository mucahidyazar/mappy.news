import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Layout standard for every page:
 * - one horizontal rhythm: px-4 → sm:px-6 → lg:px-8, shared by headers, footers and page bodies, so content
 *   always lines up with the logo;
 * - two widths: `default` (max-w-6xl) for the site, `wide` (max-w-7xl) for the admin panel;
 * - narrower reading columns (legal pages, forms) sit inside the container, left-aligned, never in a
 *   container of their own.
 */
const WIDTHS = {
  default: "max-w-6xl",
  wide: "max-w-7xl",
} as const;

export function Container({ size = "default", className, ...props }: ComponentProps<"div"> & { size?: keyof typeof WIDTHS }) {
  return <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", WIDTHS[size], className)} {...props} />;
}

/** The body of a content page: standard container plus standard vertical spacing. */
export function Page({ className, size, ...props }: ComponentProps<"div"> & { size?: keyof typeof WIDTHS }) {
  return <Container size={size} className={cn("py-8 md:py-12", className)} {...props} />;
}

/** Standard page heading block used by all content pages. */
export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 flex flex-col gap-4 md:mb-10 md:flex-row md:items-end md:justify-between", className)}>
      <div className="max-w-3xl space-y-2">
        {eyebrow ? <p className="text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</p> : null}
        <h1 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">{title}</h1>
        {description ? <p className="text-base leading-relaxed text-muted-foreground md:text-lg">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Standard surface for grouped content. */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-2xl border bg-card p-5", className)} {...props} />;
}
