import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { clientIp, requestId } from "./api";
import type { Principal } from "./auth";

export async function writeAudit(request: Request, principal: Principal, input: {
  projectId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  await getDb().insert(auditLogs).values({
    id: crypto.randomUUID(),
    projectId: input.projectId ?? null,
    actorEmail: principal.email,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    beforeJson: input.before === undefined ? null : JSON.stringify(input.before),
    afterJson: input.after === undefined ? null : JSON.stringify(input.after),
    requestId: requestId(request),
    sourceIp: clientIp(request),
  });
}
