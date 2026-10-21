import { useId } from "react";

import { cn } from "@/lib/utils";

import { CATEGORY_ICON_PATHS, isCategoryIconKey } from "./category-icon-paths";

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const maskId = useId();
  const glyph = CATEGORY_ICON_PATHS[isCategoryIconKey(icon) ? icon : "newspaper-sharp"];
  const holes = glyph.paths.filter((path) => "hole" in path);
  const shapes = glyph.paths.filter((path) => !("hole" in path));

  return (
    <svg
      viewBox={`0 0 ${glyph.width} ${glyph.height}`}
      className={cn("size-4 shrink-0", className)}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {holes.length > 0 ? (
        <defs>
          <mask id={maskId}>
            <rect width={glyph.width} height={glyph.height} fill="white" />
            {holes.map((path, index) => (
              <path key={index} d={path.d} fill="black" />
            ))}
          </mask>
        </defs>
      ) : null}
      <g mask={holes.length > 0 ? `url(#${maskId})` : undefined}>
        {shapes.map((path, index) => (
          <path key={index} d={path.d} />
        ))}
      </g>
    </svg>
  );
}

/** A colored round badge with the category glyph, used in lists and popups. */
export function CategoryBadgeIcon({
  icon,
  color,
  className,
  iconClassName,
}: {
  icon: string;
  color: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm", className)}
      style={{ backgroundColor: color }}
    >
      <CategoryIcon icon={icon} className={cn("size-4", iconClassName)} />
    </span>
  );
}
