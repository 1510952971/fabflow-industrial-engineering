import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, integrationEvents } from "@/db/schema";
import { integrationConnectors } from "@/db/workflow-schema";
import { ApiError, errorResponse, requestId } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";
import { parseStringList } from "@/lib/integration-config";
import { processIntegrationPayload } from "@/lib/integration-processing";

function ipv4Number(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((total, part) => ((total << 8) | part) >>> 0, 0);
}

function ipAllowed(ip: string, entries: string[]) {
  return entries.some((entry) => {
    if (!entry.includes("/")) return entry === ip;
    const [network, prefixRaw] = entry.split("/");
    const value = ipv4Number(ip); const base = ipv4Number(network); const prefix = Number(prefixRaw);
    if (value === null || base === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (base & mask);
  });
}

type IncomingPayload = { sourceSystem?: string; eventType?: string; externalId?: string; projectId?: string; payload?: Record<string, unknown> };

export async function POST(request: Request) {
  try {
    const configured = env.INTEGRATION_API_KEY;
    if (!configured) throw new ApiError(503, "企业集成入口尚未绑定 INTEGRATION_API_KEY", "INTEGRATION_DISABLED");
    if (request.headers.get("x-fabflow-integration-key") !== configured) throw new ApiError(401, "集成凭据无效", "INVALID_INTEGRATION_KEY");
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) throw new ApiError(400, "必须提供 Idempotency-Key", "IDEMPOTENCY_REQUIRED");
    const body = await request.json() as IncomingPayload;
    if (!body.sourceSystem || !body.eventType || !body.externalId) throw new ApiError(400, "sourceSystem、eventType、externalId 必填", "INVALID_INPUT");
    const projectId = body.projectId ?? PUBLIC_DEMO_PROJECT_ID;
    const db = getDb();
    const [connector] = await db.select().from(integrationConnectors).where(and(
      eq(integrationConnectors.projectId, projectId), eq(integrationConnectors.sourceSystem, body.sourceSystem),
    )).limit(1);
    if (!connector) throw new ApiError(404, "项目连接器不存在", "CONNECTOR_NOT_FOUND");
    const allowlist = parseStringList(connector.inboundAllowlistJson, "来源 IP 白名单");
    if (allowlist.length) {
      const sourceIp = request.headers.get("cf-connecting-ip") ?? "";
      if (!sourceIp || !ipAllowed(sourceIp, allowlist)) throw new ApiError(403, "请求来源 IP 不在连接器白名单", "SOURCE_IP_FORBIDDEN");
    }
    const result = await processIntegrationPayload({
      sourceSystem: body.sourceSystem, eventType: body.eventType, externalId: body.externalId,
      projectId, payload: body.payload ?? {},
    }, idempotencyKey, requestId(request));
    return Response.json(result, { status: result.duplicate ? 200 : 202 });
  } catch (error) { return errorResponse(error); }
}

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "integrations:read");
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId);
    const status = url.searchParams.get("status");
    const db = getDb();
    const rows = status
      ? await db.select().from(integrationEvents).where(and(eq(integrationEvents.projectId, projectId), eq(integrationEvents.status, status))).orderBy(desc(integrationEvents.receivedAt)).limit(300)
      : await db.select().from(integrationEvents).where(eq(integrationEvents.projectId, projectId)).orderBy(desc(integrationEvents.receivedAt)).limit(300);
    return Response.json({ events: rows });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const principal = await authorize(request, "integrations:manage");
    assertAuthenticated(principal);
    const body = await request.json() as { id?: string; action?: string; errorMessage?: string };
    if (!body.id || !["retry", "dead_letter", "replay"].includes(body.action ?? "")) throw new ApiError(400, "集成事件动作无效", "INVALID_INPUT");
    const db = getDb();
    const [before] = await db.select().from(integrationEvents).where(eq(integrationEvents.id, body.id)).limit(1);
    if (!before) throw new ApiError(404, "集成事件不存在", "NOT_FOUND");
    assertProjectAccess(principal, before.projectId, true);
    const retryCount = before.retryCount + (body.action === "retry" || body.action === "replay" ? 1 : 0);
    const status = body.action === "dead_letter" || retryCount >= 5 ? "dead_letter" : "queued";
    await db.update(integrationEvents).set({ status, retryCount, errorMessage: body.errorMessage ?? before.errorMessage, processedAt: null }).where(eq(integrationEvents.id, body.id));
    const [after] = await db.select().from(integrationEvents).where(eq(integrationEvents.id, body.id)).limit(1);
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), projectId: before.projectId, actorEmail: principal.email, action: `integration_event.${body.action}`, entityType: "integration_event", entityId: body.id, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after), requestId: requestId(request) });
    return Response.json({ event: after });
  } catch (error) { return errorResponse(error); }
}