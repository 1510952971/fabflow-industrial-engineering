import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { signatureProviders } from "@/db/workflow-schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { AUTH_TYPES, authHeaders, fetchWithTimeout, resolveCredential, validateCredentialRef, validateRemoteEndpoint } from "@/lib/integration-config";

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "signatures:read");
    const projectId = new URL(request.url).searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId);
    const rows = await getDb().select().from(signatureProviders).where(eq(signatureProviders.projectId, projectId)).orderBy(desc(signatureProviders.updatedAt)).limit(20);
    return Response.json({ providers: rows.map(({ credentialRef, callbackSecretRef, ...row }) => ({ ...row, credentialRef, callbackSecretRef })) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "signatures:manage");
    assertAuthenticated(principal);
    const body = await request.json() as { id?: string; projectId?: string; providerType?: string; displayName?: string; endpointUrl?: string; authType?: string; credentialRef?: string; callbackSecretRef?: string; healthcheckPath?: string };
    const projectId = body.projectId ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId, true);
    if (!body.displayName || !body.endpointUrl) throw new ApiError(400, "签章服务名称和地址必填", "INVALID_INPUT");
    const authType = body.authType ?? "bearer";
    if (!(AUTH_TYPES as readonly string[]).includes(authType) || authType === "none") throw new ApiError(400, "签章服务必须使用受支持的认证方式", "INVALID_AUTH_TYPE");
    const credentialRef = validateCredentialRef(body.credentialRef, authType)!;
    const callbackSecretRef = validateCredentialRef(body.callbackSecretRef, "bearer")!;
    const endpointUrl = validateRemoteEndpoint(body.endpointUrl, request).toString();
    const healthcheckPath = body.healthcheckPath?.trim() || "/health";
    if (!healthcheckPath.startsWith("/") || healthcheckPath.startsWith("//")) throw new ApiError(400, "健康检查路径必须以单个 / 开头", "INVALID_HEALTHCHECK_PATH");
    const db = getDb();
    const [existing] = await db.select().from(signatureProviders).where(and(eq(signatureProviders.projectId, projectId), eq(signatureProviders.displayName, body.displayName.trim()))).limit(1);
    const values = { projectId, providerType: body.providerType ?? "generic_rest", displayName: body.displayName.trim(), endpointUrl, authType, credentialRef, callbackSecretRef, healthcheckPath, enabled: false, status: "configured", lastError: null, updatedAt: new Date().toISOString() };
    if (existing) {
      await db.update(signatureProviders).set(values).where(eq(signatureProviders.id, existing.id));
      const [after] = await db.select().from(signatureProviders).where(eq(signatureProviders.id, existing.id)).limit(1);
      await writeAudit(request, principal, { projectId, action: "signature_provider.update", entityType: "signature_provider", entityId: existing.id, before: existing, after });
      return Response.json({ provider: after, updated: true });
    }
    const row = { id: body.id ?? crypto.randomUUID(), ...values };
    await db.insert(signatureProviders).values(row);
    await writeAudit(request, principal, { projectId, action: "signature_provider.create", entityType: "signature_provider", entityId: row.id, after: row });
    return Response.json({ provider: row }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const principal = await authorize(request, "signatures:manage");
    assertAuthenticated(principal);
    const body = await request.json() as { id?: string; action?: "test" | "enable" | "disable" };
    if (!body.id || !body.action) throw new ApiError(400, "签章服务动作无效", "INVALID_INPUT");
    const db = getDb();
    const [provider] = await db.select().from(signatureProviders).where(eq(signatureProviders.id, body.id)).limit(1);
    if (!provider) throw new ApiError(404, "签章服务不存在", "NOT_FOUND");
    assertProjectAccess(principal, provider.projectId, true);
    const now = new Date().toISOString();
    if (body.action === "test") {
      try {
        const endpoint = validateRemoteEndpoint(provider.endpointUrl, request);
        endpoint.pathname = provider.healthcheckPath;
        endpoint.search = "";
        const response = await fetchWithTimeout(endpoint, { method: "GET", headers: authHeaders(provider.authType, resolveCredential(provider.credentialRef)) }, 10000);
        await response.body?.cancel();
        if (!response.ok) throw new ApiError(502, `签章服务返回 HTTP ${response.status}`, "SIGNATURE_PROVIDER_UNHEALTHY");
        await db.update(signatureProviders).set({ status: "healthy", lastHealthCheckAt: now, lastError: null, updatedAt: now }).where(eq(signatureProviders.id, provider.id));
        await writeAudit(request, principal, { projectId: provider.projectId, action: "signature_provider.health_check", entityType: "signature_provider", entityId: provider.id, after: { status: "healthy", responseCode: response.status } });
        return Response.json({ healthy: true, responseCode: response.status, checkedAt: now });
      } catch (error) {
        const message = error instanceof Error ? error.message : "签章服务检查失败";
        await db.update(signatureProviders).set({ status: "error", lastHealthCheckAt: now, lastError: message, updatedAt: now }).where(eq(signatureProviders.id, provider.id));
        throw error;
      }
    }
    if (body.action === "enable" && provider.status !== "healthy") throw new ApiError(409, "签章服务必须先通过真实连通性检查", "PROVIDER_NOT_VERIFIED");
    await db.update(signatureProviders).set({ enabled: body.action === "enable", status: body.action === "disable" ? "configured" : provider.status, updatedAt: now }).where(eq(signatureProviders.id, provider.id));
    return Response.json({ enabled: body.action === "enable" });
  } catch (error) { return errorResponse(error); }
}
