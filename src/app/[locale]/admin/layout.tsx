import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Container } from "@/components/layout/container";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { Locale } from "@/i18n/routing";
import { can, isStaff } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/site";
import { getAdminBadges, getSidebarBot } from "@/server/admin/badges";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: { default: t("title"), template: `%s · ${t("title")}` }, robots: { index: false, follow: false } };
}

export default async function AdminLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) redirect(`${localizedPath("/sign-in", locale as Locale)}?next=${encodeURIComponent(localizedPath("/admin", locale as Locale))}`);
  if (!isStaff(user.role)) notFound();

  const [badges, bot, cookieStore] = await Promise.all([
    getAdminBadges(),
    can(user.role, "bot.view") ? getSidebarBot() : Promise.resolve(null),
    cookies(),
  ]);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AdminSidebar role={user.role} badges={badges} bot={bot} />
      <SidebarInset className="min-w-0 bg-[radial-gradient(1100px_420px_at_70%_-160px,color-mix(in_oklch,var(--primary)_9%,transparent),transparent)]">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/70 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <SidebarTrigger className="-ml-1.5 text-muted-foreground hover:text-foreground" />
          <Separator orientation="vertical" className="mr-1.5 h-5" />
          <AdminBreadcrumb />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <LocaleSwitcher />
            <UserMenu />
          </div>
        </header>
        <Container size="wide" className="flex-1 py-6 md:py-8">
          {children}
        </Container>
      </SidebarInset>
    </SidebarProvider>
  );
}
