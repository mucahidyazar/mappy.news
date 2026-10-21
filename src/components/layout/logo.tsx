import Image from "next/image";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link
      href="/"
      className={cn(
        "group inline-flex items-center gap-2 rounded-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <Image
        src="/brand/web-app-manifest-192x192.png"
        alt=""
        width={32}
        height={32}
        priority
        className="size-8 rounded-md shadow-sm transition-transform group-hover:-rotate-3"
      />
      <span className={cn("text-[15px] leading-none", compact && "hidden sm:inline")}>
        mappy<span className="text-muted-foreground">.news</span>
      </span>
    </Link>
  );
}
