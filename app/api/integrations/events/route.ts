import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, integrationEvents, operationalEvents, purchaseOrders } from "@/db/schema";
import { ApiError, errorResponse, requestId } from "@/lib/api";

type IntegrationPayload = { sourceSystem?: string; eventType?: string; externalId?: string; projectId?: string; payload?: Record<string, unknown> };

export async function POST(request: Request) {
  try {
    const configured = env.INTEGRATION_API_KEY;
    if (!configured) throw new ApiError(503, "企业集成密钥尚未配置", "INTEGRATION_DISABLED");
    if (request.headers.get("x-fabflow-integration-key") !== configured) throw new ApiError(401, "集成凭据无效", "INVALID_INTEGRATION_KEY");
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) throw new ApiError(400, "必须提供 Idempotency-Key", "IDEMPOTENCY_REQUIRED");
    const body = await request.json() as IntegrationPayload;
    if (!body.sourceSystem || !body.eventType || !body.externalId) throw new ApiError(400, "sourceSystem、eventType、externalId 必填", "INVALID_INPUT");
    const db = getDb();
    const [existing] = await db.select().from(integrationEvents).where(eq(integrationEvents.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) return Response.json({ event: existing, duplicate: true });
    const eventId = crypto.randomUUID();
    const projectId = body.projectId ?? "proj-fab2a";
    let status = "queued";
    if (body.eventType === "erp.po.upsert") {
      const p = body.payload ?? {};
      if (!p.poNumber || !p.supplier || !p.packageCode) throw new ApiError(400, "ERP PO 事件缺少订单字段", "INVALID_PAYLOAD");
      await db.insert(purchaseOrders).values({ id: crypto.randomUUID(), projectId, poNumber: String(p.poNumber), supplier: String(p.supplier), packageCode: String(p.packageCode), amountCny: Number(p.amountCny ?? 0), promisedDate: p.promisedDate ? String(p.promisedDate) : null, status: String(p.status ?? "placed"), sourceSystem: body.sourceSystem, externalId: body.externalId }).onConflictDoUpdate({ target: [purchaseOrders.projectId, purchaseOrders.poNumber], set: { supplier: String(p.supplier), amountCny: Number(p.amountCny ?? 0), promisedDate: p.promisedDate ? String(p.promisedDate) : null, status: String(p.status ?? "placed"), sourceSystem: body.sourceSystem, externalId: body.externalId, updatedAt: new Date().toISOString() } });
      status = "processed";
    } else if (body.eventType.startsWith("bms.") || body.eventType.startsWith("epms.") || body.eventType.startsWith("scada.")) {
      const p = body.payload ?? {};
      if (!p.tagNo || !p.occurredAt) throw new ApiError(400, "运行事件缺少 tagNo 或 occurredAt", "INVALID_PAYLOAD");
      await db.insert(operationalEvents).values({ id: crypto.randomUUID(), projectId, sourceSystem: body.sourceSystem, tagNo: String(p.tagNo), eventType: body.eventType, severity: String(p.severity ?? "info"), value: p.value === undefined ? null : Number(p.value), unit: p.unit ? String(p.unit) : null, quality: String(p.quality ?? "good"), occurredAt: String(p.occurredAt), payloadJson: JSON.stringify(p) });
      status = "processed";
    }
    const event = { id: eventId, projectId, sourceSystem: body.sourceSystem, eventType: body.eventType, externalId: body.externalId, idempotencyKey, payloadJson: JSON.stringify(body.payload ?? {}), status, retryCount: 0, processedAt: status === "processed" ? new Date().toISOString() : null };
    await db.insert(integrationEvents).values(event);
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), projectId, actorEmail: `integration:${body.sourceSystem}`, action: `integration.${body.eventType}`, entityType: "integration_event", entityId: eventId, afterJson: JSON.stringify({ sourceSystem: body.sourceSystem, externalId: body.externalId, status }), requestId: requestId(request) });
    return Response.json({ event, duplicate: false }, { status: 202 });
  } catch (error) { return errorResponse(error); }
}
