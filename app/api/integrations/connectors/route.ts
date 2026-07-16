import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { integrationConnectors } from "@/db/workflow-schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "integrations:read");
    const projectId = new URL(request.url).searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId);
    const rows = await getDb().select().from(integrationConnectors).where(eq(integrationConnectors.projectId, projectId)).orderBy(desc(integrationConnectors.updatedAt)).limit(100);
    return Response.json({ connectors: rows });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "integrations:manage");
    assertAuthenticated(principal);
    const body = await request.json() as { id?: string; projectId?: string; sourceSystem?: string; displayName?: string; mode?: string; endpointUrl?: string; cursor?: string; status?: string; retryLimit?: number; enabled?: boolean };
    const projectId = body.projectId ?? PUBLIC_DEMO_PROJECT_ID;
    if (!body.sourceSystem || !body.displayName || !body.mode) throw new ApiError(400, "sourceSystem、displayName、mode 必填", "INVALID_INPUT");
    assertProjectAccess(principal, projectId, true);
    const db = getDb();
    const values = { projectId, sourceSystem: body.sourceSystem.trim(), displayName: body.displayName.trim(), mode: body.mode.trim(), endpointUrl: body.endpointUrl?.trim() || null, cursor: body.cursor ?? null, status: body.status ?? "not_configured", retryLimit: Math.max(1, Math.min(20, Math.round(body.retryLimit ?? 5))), enabled: body.enabled ?? false, updatedAt: new Date().toISOString() };
    const [existing] = await db.select().from(integrationConnectors).where(and(eq(integrationConnectors.projectId, projectId), eq(integrationConnectors.sourceSystem, values.sourceSystem))).limit(1);
    if (existing) {
      await db.update(integrationConnectors).set(values).where(eq(integrationConnectors.id, existing.id));
      const [updated] = await db.select().from(integrationConnectors).where(eq(integrationConnectors.id, existing.id)).limit(1);
      await writeAudit(request, principal, { projectId, action: "integration_connector.update", entityType: "integration_connector", entityId: existing.id, before: existing, after: updated });
      return Response.json({ connector: updated, updated: true });
    }
    const row = { id: body.id ?? crypto.randomUUID(), ...values };
    await db.insert(integrationConnectors).values(row);
    await writeAudit(request, principal, { projectId, action: "integration_connector.create", entityType: "integration_connector", entityId: row.id, after: row });
    return Response.json({ connector: row }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const principal = await authorize(request, "integrations:manage");
    assertAuthenticated(principal);
    const body = await request.json() as { id?: string; enabled?: boolean; status?: string; cursor?: string; lastError?: string | null; lastSyncAt?: string | null; lastSuccessAt?: string | null };
    if (!body.id) throw new ApiError(400, "连接器 ID 缺失", "INVALID_INPUT");
    const db = getDb();
    const [before] = await db.select().from(integrationConnectors).where(eq(integrationConnectors.id, body.id)).limit(1);
    if (!before) throw new ApiError(404, "连接器不存在", "NOT_FOUND");
    assertProjectAccess(principal, before.projectId, true);
    await db.update(integrationConnectors).set({ enabled: body.enabled ?? before.enabled, status: body.status ?? before.status, cursor: body.cursor ?? before.cursor, lastError: body.lastError === undefined ? before.lastError : body.lastError, lastSyncAt: body.lastSyncAt === undefined ? before.lastSyncAt : body.lastSyncAt, lastSuccessAt: body.lastSuccessAt === undefined ? before.lastSuccessAt : body.lastSuccessAt, updatedAt: new Date().toISOString() }).where(eq(integrationConnectors.id, body.id));
    const [after] = await db.select().from(integrationConnectors).where(eq(integrationConnectors.id, body.id)).limit(1);
    await writeAudit(request, principal, { projectId: before.projectId, action: "integration_connector.update", entityType: "integration_connector", entityId: before.id, before, after });
    return Response.json({ connector: after });
  } catch (error) { return errorResponse(error); }
}
