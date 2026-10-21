"use client";

import { Map, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { ReportButton } from "@/components/report/report-button";
import { Button } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { Container } from "./container";
import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function SiteHeader() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const links = [
    { href: "/", label: t("map"), icon: Map },
    { href: "/leaderboard", label: t("leaderboard"), icon: Trophy },
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
      <Container className="flex h-14 items-center gap-3">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label={t("main")}>
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Button
                key={href}
                asChild
                variant="ghost"
                size="sm"
                className={cn("gap-1.5 text-muted-foreground", active && "bg-accent text-foreground")}
              >
                <Link href={href} aria-current={active ? "page" : undefined}>
                  <Icon className="size-4" /> {label}
                </Link>
              </Button>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Suspense>
            <ReportButton className="hidden sm:inline-flex" />
          </Suspense>
          <ThemeToggle />
          <Suspense>
            <LocaleSwitcher />
          </Suspense>
          <UserMenu />
        </div>
      </Container>
    </header>
  );
}
