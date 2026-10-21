import type { ReactNode } from "react";

import { Container } from "@/components/layout/container";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_10%_-10%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent),radial-gradient(50rem_30rem_at_110%_110%,color-mix(in_oklch,var(--chart-2)_16%,transparent),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] dark:opacity-20"
      />
      <header>
        <Container className="flex h-14 items-center justify-between">
          <Logo />
          <ThemeToggle />
        </Container>
      </header>
      <main className="flex flex-1">
        <Container className="flex flex-1 items-start justify-center pt-6 pb-16 sm:items-center sm:pt-0">{children}</Container>
      </main>
    </div>
  );
}
