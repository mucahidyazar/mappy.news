/** Badge classes per story status, shared by server and client admin views. */
export const STATUS_BADGE: Record<string, string> = {
  pending: "border-warning/50 bg-warning/15",
  published: "border-success/50 bg-success/15",
  rejected: "border-destructive/50 bg-destructive/10",
  archived: "border-border bg-muted text-muted-foreground",
  approved: "border-success/50 bg-success/15",
  visible: "border-success/50 bg-success/15",
  hidden: "border-border bg-muted text-muted-foreground",
};
