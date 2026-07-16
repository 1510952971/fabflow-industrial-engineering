import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { workflowActions } from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

type ActionInput = {
  id?: string;
  projectId?: string | null;
  actionType?: string;
  title?: string;
  entityType?: string | null;
  entityId?: string | null;
  status?: string;
  assignedTo?: string | null;
  dueAt?: string | null;
  payload?: Record<string, unknown>;
  upsert?: boolean;
};

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "data:read");
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId);
    const status = url.searchParams.get("status");
    const actionType = url.searchParams.get("actionType");
    const entityType = url.searchParams.get("entityType");
    const db = getDb();
    const conditions = [eq(workflowActions.projectId, projectId)];
    if (status) conditions.push(eq(workflowActions.status, status));
    if (actionType) conditions.push(eq(workflowActions.actionType, actionType));
    if (entityType) conditions.push(eq(workflowActions.entityType, entityType));
    const rows = await db.select().from(workflowActions).where(and(...conditions)).orderBy(desc(workflowActions.createdAt)).limit(300);
    return Response.json({ actions: rows });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "data:write");
    assertAuthenticated(principal);
    const body = await request.json() as ActionInput;
    if (!body.actionType?.trim() || !body.title?.trim()) throw new ApiError(400, "actionType 和 title 必填", "INVALID_INPUT");
    const projectId = body.projectId ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId, true);
    const row = {
      id: crypto.randomUUID(), projectId, actionType: body.actionType.trim(), title: body.title.trim(),
      entityType: body.entityType ?? null, entityId: body.entityId ?? null, status: body.status ?? "open", assignedTo: body.assignedTo ?? null,
      dueAt: body.dueAt ?? null, payloadJson: JSON.stringify(body.payload ?? {}), requestedBy: principal.email,
    };
    const db = getDb();
    const existing = body.entityType && body.entityId
      ? (await db.select().from(workflowActions).where(and(eq(workflowActions.projectId, projectId), eq(workflowActions.actionType, row.actionType), eq(workflowActions.entityType, body.entityType), eq(workflowActions.entityId, body.entityId))).limit(1))[0]
      : null;
    if (existing && body.upsert) {
      await db.update(workflowActions).set({ title: row.title, status: row.status, assignedTo: row.assignedTo, dueAt: row.dueAt, payloadJson: row.payloadJson, updatedAt: new Date().toISOString() }).where(eq(workflowActions.id, existing.id));
      const [updated] = await db.select().from(workflowActions).where(eq(workflowActions.id, existing.id)).limit(1);
      await writeAudit(request, principal, { projectId, action: "workflow_action.update", entityType: updated.entityType ?? "workflow_action", entityId: existing.id, before: existing, after: updated });
      return Response.json({ action: updated, updated: true });
    }
    await db.insert(workflowActions).values(row);
    await writeAudit(request, principal, { projectId: row.projectId, action: "workflow_action.create", entityType: row.entityType ?? "workflow_action", entityId: row.id, after: row });
    return Response.json({ action: row }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const principal = await authorize(request, "data:write");
    assertAuthenticated(principal);
    const body = await request.json() as ActionInput;
    if (!body.id) throw new ApiError(400, "动作 ID 缺失", "INVALID_INPUT");
    const db = getDb();
    const [before] = await db.select().from(workflowActions).where(eq(workflowActions.id, body.id)).limit(1);
    if (!before) throw new ApiError(404, "工作流动作不存在", "NOT_FOUND");
    assertProjectAccess(principal, before.projectId, true);
    const status = body.status ?? before.status;
    const values = {
      status, assignedTo: body.assignedTo === undefined ? before.assignedTo : body.assignedTo,
      dueAt: body.dueAt === undefined ? before.dueAt : body.dueAt,
      payloadJson: body.payload === undefined ? before.payloadJson : JSON.stringify(body.payload),
      completedAt: ["completed", "closed", "cancelled"].includes(status) ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    };
    await db.update(workflowActions).set(values).where(eq(workflowActions.id, body.id));
    const [after] = await db.select().from(workflowActions).where(eq(workflowActions.id, body.id)).limit(1);
    await writeAudit(request, principal, { projectId: before.projectId, action: "workflow_action.update", entityType: before.entityType ?? "workflow_action", entityId: body.id, before, after });
    return Response.json({ action: after });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const principal = await authorize(request, "data:write");
    assertAuthenticated(principal);
    const body = await request.json() as ActionInput;
    if (!body.id) throw new ApiError(400, "动作 ID 缺失", "INVALID_INPUT");
    const db = getDb();
    const [before] = await db.select().from(workflowActions).where(eq(workflowActions.id, body.id)).limit(1);
    if (!before) throw new ApiError(404, "工作流动作不存在", "NOT_FOUND");
    assertProjectAccess(principal, before.projectId, true);
    await db.delete(workflowActions).where(eq(workflowActions.id, body.id));
    await writeAudit(request, principal, { projectId: before.projectId, action: "workflow_action.delete", entityType: before.entityType ?? "workflow_action", entityId: body.id, before });
    return Response.json({ id: body.id, deleted: true });
  } catch (error) { return errorResponse(error); }
}
