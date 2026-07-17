import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { integrationConnectors, integrationSyncRuns } from "@/db/workflow-schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ADAPTER_PROFILES, AUTH_TYPES, parseMapping, parseStringList, validateCredentialRef, validateRemoteEndpoint } from "@/lib/integration-config";

type ConnectorBody = {
  id?: string; projectId?: string; sourceSystem?: string; displayName?: string; mode?: string; endpointUrl?: string;
  adapterProfile?: string; authType?: string; credentialRef?: string; fieldMapping?: unknown; fieldMappingJson?: string;
  inboundAllowlist?: string[]; inboundAllowlistJson?: string; healthcheckPath?: string; timeoutMs?: number; cursor?: string;
  retryLimit?: number; enabled?: boolean;
};

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "integrations:read");
    const projectId = new URL(request.url).searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId);
    const db = getDb();
    const rows = await db.select().from(integrationConnectors).where(eq(integrationConnectors.projectId, projectId)).orderBy(desc(integrationConnectors.updatedAt)).limit(100);
    const runs = await db.select().from(integrationSyncRuns).where(eq(integrationSyncRuns.projectId, projectId)).orderBy(desc(integrationSyncRuns.startedAt)).limit(100);
    return Response.json({ connectors: rows, runs });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "integrations:manage");
    assertAuthenticated(principal);
    const body = await request.json() as ConnectorBody;
    const projectId = body.projectId ?? PUBLIC_DEMO_PROJECT_ID;
    if (!body.sourceSystem || !body.displayName || !body.mode) throw new ApiError(400, "sourceSystem、displayName、mode 必填", "INVALID_INPUT");
    assertProjectAccess(principal, projectId, true);
    const adapterProfile = body.adapterProfile ?? "erp_po";
    const authType = body.authType ?? "none";
    if (!(ADAPTER_PROFILES as readonly string[]).includes(adapterProfile)) throw new ApiError(400, "适配器模板无效", "INVALID_ADAPTER_PROFILE");
    if (!(AUTH_TYPES as readonly string[]).includes(authType)) throw new ApiError(400, "认证类型无效", "INVALID_AUTH_TYPE");
    const endpointUrl = validateRemoteEndpoint(body.endpointUrl, request).toString();
    const credentialRef = validateCredentialRef(body.credentialRef, authType);
    const fieldMappingJson = body.fieldMapping !== undefined ? JSON.stringify(body.fieldMapping) : (body.fieldMappingJson ?? "{}");
    parseMapping(fieldMappingJson, adapterProfile);
    const allowlist = body.inboundAllowlist ?? parseStringList(body.inboundAllowlistJson, "来源 IP 白名单");
    parseStringList(JSON.stringify(allowlist), "来源 IP 白名单");
    const healthcheckPath = body.healthcheckPath?.trim() || null;
    if (healthcheckPath && (!healthcheckPath.startsWith("/") || healthcheckPath.startsWith("//"))) throw new ApiError(400, "健康检查路径必须以单个 / 开头", "INVALID_HEALTHCHECK_PATH");
    const db = getDb();
    const values = {
      projectId, sourceSystem: body.sourceSystem.trim().toUpperCase(), displayName: body.displayName.trim(), mode: body.mode.trim(),
      endpointUrl, adapterProfile, authType, credentialRef, fieldMappingJson, inboundAllowlistJson: JSON.stringify(allowlist),
      healthcheckPath, timeoutMs: Math.max(1000, Math.min(30000, Math.round(body.timeoutMs ?? 10000))),
      cursor: body.cursor ?? null, status: "configured", retryLimit: Math.max(1, Math.min(20, Math.round(body.retryLimit ?? 5))),
      enabled: false, updatedAt: new Date().toISOString(),
    };
    const [existing] = await db.select().from(integrationConnectors).where(and(
      eq(integrationConnectors.projectId, projectId), eq(integrationConnectors.sourceSystem, values.sourceSystem),
    )).limit(1);
    if (existing) {
      await db.update(integrationConnectors).set({ ...values, verifiedAt: null, lastError: null }).where(eq(integrationConnectors.id, existing.id));
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
    const body = await request.json() as { id?: string; enabled?: boolean; cursor?: string | null };
    if (!body.id) throw new ApiError(400, "连接器 ID 缺失", "INVALID_INPUT");
    const db = getDb();
    const [before] = await db.select().from(integrationConnectors).where(eq(integrationConnectors.id, body.id)).limit(1);
    if (!before) throw new ApiError(404, "连接器不存在", "NOT_FOUND");
    assertProjectAccess(principal, before.projectId, true);
    if (body.enabled && !before.verifiedAt) throw new ApiError(409, "连接器必须先通过真实连通性检查才能启用", "CONNECTOR_NOT_VERIFIED");
    await db.update(integrationConnectors).set({
      enabled: body.enabled ?? before.enabled, cursor: body.cursor === undefined ? before.cursor : body.cursor,
      status: body.enabled === false ? "configured" : before.status, updatedAt: new Date().toISOString(),
    }).where(eq(integrationConnectors.id, body.id));
    const [after] = await db.select().from(integrationConnectors).where(eq(integrationConnectors.id, body.id)).limit(1);
    await writeAudit(request, principal, { projectId: before.projectId, action: "integration_connector.update", entityType: "integration_connector", entityId: before.id, before, after });
    return Response.json({ connector: after });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const principal = await authorize(request, "integrations:manage");
    assertAuthenticated(principal);
    const body = await request.json() as { id?: string };
    if (!body.id) throw new ApiError(400, "连接器 ID 缺失", "INVALID_INPUT");
    const db = getDb();
    const [before] = await db.select().from(integrationConnectors).where(eq(integrationConnectors.id, body.id)).limit(1);
    if (!before) throw new ApiError(404, "连接器不存在", "NOT_FOUND");
    assertProjectAccess(principal, before.projectId, true);
    const after = { enabled: false, status: "archived", updatedAt: new Date().toISOString() };
    await db.update(integrationConnectors).set(after).where(eq(integrationConnectors.id, body.id));
    await writeAudit(request, principal, { projectId: before.projectId, action: "integration_connector.archive", entityType: "integration_connector", entityId: before.id, before, after });
    return Response.json({ id: body.id, archived: true });
  } catch (error) { return errorResponse(error); }
}