import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { integrationConnectors, integrationSyncRuns } from "@/db/workflow-schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { authHeaders, fetchWithTimeout, resolveCredential, validateRemoteEndpoint } from "@/lib/integration-config";

export async function POST(request: Request) {
  const runId = crypto.randomUUID();
  let connectorId: string | undefined;
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
    await db.insert(integrationSyncRuns).values({
      id: runId, projectId: connector.projectId, connectorId, runType: "health_check", requestedBy: principal.email,
    });
    const endpoint = validateRemoteEndpoint(connector.endpointUrl, request);
    if (connector.healthcheckPath) endpoint.pathname = connector.healthcheckPath;
    const credential = resolveCredential(connector.credentialRef);
    const response = await fetchWithTimeout(endpoint, { method: "GET", headers: authHeaders(connector.authType, credential) }, connector.timeoutMs);
    const now = new Date().toISOString();
    if (!response.ok) throw new ApiError(502, `上游健康检查返回 HTTP ${response.status}`, "UPSTREAM_UNHEALTHY");
    await response.body?.cancel();
    await db.update(integrationConnectors).set({
      status: "healthy", lastHealthCheckAt: now, verifiedAt: now, lastError: null, updatedAt: now,
    }).where(eq(integrationConnectors.id, connector.id));
    await db.update(integrationSyncRuns).set({ status: "succeeded", responseCode: response.status, finishedAt: now }).where(eq(integrationSyncRuns.id, runId));
    await writeAudit(request, principal, { projectId: connector.projectId, action: "integration_connector.health_check", entityType: "integration_connector", entityId: connector.id, after: { status: "healthy", responseCode: response.status } });
    return Response.json({ healthy: true, responseCode: response.status, checkedAt: now, runId });
  } catch (error) {
    if (connectorId) {
      try {
        const db = getDb();
        const message = error instanceof Error ? error.message : "健康检查失败";
        const now = new Date().toISOString();
        await db.update(integrationConnectors).set({ status: "error", lastHealthCheckAt: now, lastError: message, updatedAt: now }).where(eq(integrationConnectors.id, connectorId));
        await db.update(integrationSyncRuns).set({ status: "failed", errorMessage: message, finishedAt: now }).where(eq(integrationSyncRuns.id, runId));
      } catch { /* Preserve the original error response. */ }
    }
    return errorResponse(error);
  }
}
