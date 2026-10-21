import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="w-full max-w-md border-border/70 bg-card/90 shadow-xl shadow-black/5 backdrop-blur">
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-xl">{title}</CardTitle>
        {description ? <CardDescription className="leading-relaxed">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter> : null}
    </Card>
  );
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="relative my-1 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
