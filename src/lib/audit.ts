import { auditLogs } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/types";

/** Records an editor action. Call inside the transaction of the change it describes. */
export async function audit(
  tx: DbExecutor,
  entry: { actorId: string | null; action: string; targetType: string; targetId?: string | null; data?: Record<string, unknown> },
) {
  await tx.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    data: entry.data ?? {},
  });
}
