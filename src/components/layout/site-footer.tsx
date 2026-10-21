import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

import { Container } from "./container";
import { Logo } from "./logo";

export function SiteFooter() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/70">
      <Container className="flex flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-3">
          <Logo />
          <p className="text-sm leading-relaxed text-muted-foreground">{t("tagline")}</p>
        </div>
        <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm" aria-label={t("links")}>
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            {t("map")}
          </Link>
          <Link href="/leaderboard" className="text-muted-foreground hover:text-foreground">
            {t("leaderboard")}
          </Link>
          <Link href="/about" className="text-muted-foreground hover:text-foreground">
            {t("about")}
          </Link>
          <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
            {t("privacy")}
          </Link>
          <Link href="/terms" className="text-muted-foreground hover:text-foreground">
            {t("terms")}
          </Link>
        </nav>
      </Container>
      <div className="border-t border-border/70">
        <Container className="py-4 text-xs text-muted-foreground">
          © {year} mappy.news · {t("mapAttribution")}
        </Container>
      </div>
    </footer>
  );
}
