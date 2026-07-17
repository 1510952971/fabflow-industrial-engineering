import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { integrationEvents } from "@/db/schema";
import { integrationConnectors, integrationSyncRuns } from "@/db/workflow-schema";
import { ApiError, errorResponse, requestId } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { authHeaders, fetchWithTimeout, mapPullItem, parseMapping, readPath, resolveCredential, validateRemoteEndpoint } from "@/lib/integration-config";
import { processIntegrationPayload } from "@/lib/integration-processing";

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "integrations:read");
    const projectId = new URL(request.url).searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId);
    const runs = await getDb().select().from(integrationSyncRuns).where(eq(integrationSyncRuns.projectId, projectId)).orderBy(desc(integrationSyncRuns.startedAt)).limit(200);
    return Response.json({ runs });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const runId = crypto.randomUUID();
  let connectorId: string | undefined;
  let runCreated = false;
  try {
    const principal = await authorize(request, "integrations:manage");
    assertAuthenticated(principal);
    const body = await request.json() as { connectorId?: string };
    connectorId = body.connectorId;
    if (!connectorId) throw new ApiError(400, "连接器 ID 缺失", "INVALID_INPUT");
    const db = getDb();
    const [connector] = await db.select().from(integrationConnectors).where(eq(integrationConnectors.id, connectorId)).limit(1);
    if (!connector) throw new ApiError(404, "连接器不存在", "NOT_FOUND");
    assertProjectAccess(principal, connector.projectId, true);
    if (!connector.enabled || !connector.verifiedAt) throw new ApiError(409, "连接器须先通过健康检查并启用", "CONNECTOR_NOT_READY");
    await db.insert(integrationSyncRuns).values({
      id: runId, projectId: connector.projectId, connectorId, runType: "pull_sync", cursorFrom: connector.cursor,
      requestedBy: principal.email,
    });
    runCreated = true;
    const mapping = parseMapping(connector.fieldMappingJson, connector.adapterProfile);
    const endpoint = validateRemoteEndpoint(connector.endpointUrl, request);
    if (connector.cursor) endpoint.searchParams.set(mapping.cursorParam ?? "cursor", connector.cursor);
    endpoint.searchParams.set("limit", "500");
    const response = await fetchWithTimeout(endpoint, {
      method: "GET", headers: authHeaders(connector.authType, resolveCredential(connector.credentialRef)),
    }, connector.timeoutMs);
    if (!response.ok) throw new ApiError(502, `上游同步返回 HTTP ${response.status}`, "UPSTREAM_SYNC_FAILED");
    const upstream = await response.json() as unknown;
    const itemsValue = readPath(upstream, mapping.itemsPath ?? "items");
    if (!Array.isArray(itemsValue)) throw new ApiError(502, `上游响应中未找到数组 ${mapping.itemsPath ?? "items"}`, "INVALID_UPSTREAM_RESPONSE");
    const items = itemsValue.slice(0, 500);
    let written = 0; let failed = 0;
    const errors: string[] = [];
    for (const item of items) {
      try {
        const mapped = mapPullItem(item, mapping);
        if (!mapped.externalId) throw new ApiError(422, "上游记录缺少外部主键", "EXTERNAL_ID_MISSING");
        const result = await processIntegrationPayload({
          projectId: connector.projectId, sourceSystem: connector.sourceSystem, eventType: mapped.eventType,
          externalId: mapped.externalId, payload: mapped.payload,
        }, `${connector.id}:${mapped.eventType}:${mapped.externalId}`, requestId(request));
        if (!result.duplicate) written += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "记录处理失败";
        errors.push(message);
        const rawExternalId = String(readPath(item, mapping.externalIdPath) ?? crypto.randomUUID());
        await db.insert(integrationEvents).values({
          id: crypto.randomUUID(), projectId: connector.projectId, sourceSystem: connector.sourceSystem,
          eventType: mapping.eventType, externalId: rawExternalId,
          idempotencyKey: `${connector.id}:${mapping.eventType}:${rawExternalId}:failed:${runId}`,
          payloadJson: JSON.stringify(item), status: "dead_letter", retryCount: connector.retryLimit,
          errorMessage: message,
        });
      }
    }
    const cursorValue = readPath(upstream, mapping.nextCursorPath ?? "nextCursor");
    const cursorTo = cursorValue === undefined || cursorValue === null ? connector.cursor : String(cursorValue);
    const now = new Date().toISOString();
    const succeeded = failed === 0;
    await db.update(integrationConnectors).set({
      cursor: succeeded ? cursorTo : connector.cursor, status: succeeded ? "healthy" : "error", lastSyncAt: now,
      lastSuccessAt: succeeded ? now : connector.lastSuccessAt, lastError: succeeded ? null : errors.slice(0, 3).join("；"), updatedAt: now,
    }).where(eq(integrationConnectors.id, connector.id));
    await db.update(integrationSyncRuns).set({
      status: succeeded ? "succeeded" : "partial", cursorTo: succeeded ? cursorTo : connector.cursor,
      recordsRead: items.length, recordsWritten: written, recordsFailed: failed, responseCode: response.status,
      errorMessage: errors.length ? errors.slice(0, 3).join("；") : null, finishedAt: now,
    }).where(eq(integrationSyncRuns.id, runId));
    await writeAudit(request, principal, { projectId: connector.projectId, action: "integration_connector.pull_sync", entityType: "integration_connector", entityId: connector.id, after: { runId, recordsRead: items.length, recordsWritten: written, recordsFailed: failed, cursorTo } });
    return Response.json({ runId, status: succeeded ? "succeeded" : "partial", recordsRead: items.length, recordsWritten: written, recordsFailed: failed, cursorTo });
  } catch (error) {
    if (connectorId && runCreated) {
      try {
        const db = getDb(); const message = error instanceof Error ? error.message : "同步失败"; const now = new Date().toISOString();
        await db.update(integrationConnectors).set({ status: "error", lastSyncAt: now, lastError: message, updatedAt: now }).where(eq(integrationConnectors.id, connectorId));
        await db.update(integrationSyncRuns).set({ status: "failed", errorMessage: message, finishedAt: now }).where(eq(integrationSyncRuns.id, runId));
      } catch { /* Preserve the original response. */ }
    }
    return errorResponse(error);
  }
}
