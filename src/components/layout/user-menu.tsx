"use client";

import { LayoutDashboard, LogIn, LogOut, Trophy, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { authClient, useSession } from "@/lib/auth/client";
import { isStaff } from "@/lib/auth/permissions";

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toLocaleUpperCase("tr-TR");
}

export function UserAvatar({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  return (
    <Avatar className={className}>
      {image ? <AvatarImage src={image} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function UserMenu() {
  const t = useTranslations("nav");
  const { data, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  if (isPending) return <Skeleton className="size-9 rounded-full" />;

  if (!data?.user) {
    return (
      <Button asChild variant="outline" size="sm" className="gap-1.5">
        <Link href={{ pathname: "/sign-in", query: pathname !== "/" ? { next: pathname } : undefined }}>
          <LogIn className="size-4" />
          <span className="hidden sm:inline">{t("signIn")}</span>
        </Link>
      </Button>
    );
  }

  const { user } = data;
  const staff = isStaff((user as { role?: string }).role);

  async function handleSignOut() {
    setSigningOut(true);
    const { error } = await authClient.signOut();
    setSigningOut(false);
    if (error) {
      toast.error(t("signOutFailed"));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={t("account")}
        >
          <UserAvatar name={user.name} image={user.image} className="size-9 border border-border" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="truncate text-sm font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <UserRound /> {t("profile")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/leaderboard">
              <Trophy /> {t("leaderboard")}
            </Link>
          </DropdownMenuItem>
          {staff ? (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <LayoutDashboard /> {t("admin")}
              </Link>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} disabled={signingOut} variant="destructive">
          <LogOut /> {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
