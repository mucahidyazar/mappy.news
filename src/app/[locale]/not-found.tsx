import { Compass } from "lucide-react";
import { useTranslations } from "next-intl";

import { Container } from "@/components/layout/container";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <Container className="flex flex-1 flex-col items-center justify-center gap-5 py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Compass className="size-7" />
        </span>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">404</p>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="max-w-md text-muted-foreground">{t("description")}</p>
        </div>
        <Button asChild>
          <Link href="/">{t("backToMap")}</Link>
        </Button>
      </Container>
      <SiteFooter />
    </div>
  );
}
