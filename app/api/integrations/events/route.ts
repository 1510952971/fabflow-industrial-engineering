import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, equipmentComponents, equipmentFactories, equipmentModels, integrationEvents, operationalEvents, punchItems, purchaseOrders, testPacks, workflowActions } from "@/db/schema";
import { integrationConnectors } from "@/db/workflow-schema";
import { ApiError, errorResponse, requestId } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";

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
    const projectId = body.projectId ?? PUBLIC_DEMO_PROJECT_ID;
    const [connector] = await db.select().from(integrationConnectors).where(and(eq(integrationConnectors.projectId, projectId), eq(integrationConnectors.sourceSystem, body.sourceSystem))).limit(1);
    if (!connector?.enabled) throw new ApiError(403, "此项目未启用对应数据源连接器", "CONNECTOR_NOT_ENABLED");
    let status = "queued";
    if (body.eventType === "erp.po.upsert") {
      const p = body.payload ?? {};
      if (!p.poNumber || !p.supplier || !p.packageCode) throw new ApiError(400, "ERP PO 事件缺少订单字段", "INVALID_PAYLOAD");
      await db.insert(purchaseOrders).values({ id: crypto.randomUUID(), projectId, poNumber: String(p.poNumber), supplier: String(p.supplier), packageCode: String(p.packageCode), amountCny: Number(p.amountCny ?? 0), promisedDate: p.promisedDate ? String(p.promisedDate) : null, status: String(p.status ?? "placed"), sourceSystem: body.sourceSystem, externalId: body.externalId }).onConflictDoUpdate({ target: [purchaseOrders.projectId, purchaseOrders.poNumber], set: { supplier: String(p.supplier), amountCny: Number(p.amountCny ?? 0), promisedDate: p.promisedDate ? String(p.promisedDate) : null, status: String(p.status ?? "placed"), sourceSystem: body.sourceSystem, externalId: body.externalId, updatedAt: new Date().toISOString() } });
      status = "processed";
    } else if (body.eventType === "qms.test_pack.upsert") {
      const p = body.payload ?? {};
      if (!p.packNumber || !p.title || !p.testType) throw new ApiError(400, "QMS 试验包事件缺少必要字段", "INVALID_PAYLOAD");
      await db.insert(testPacks).values({ id: crypto.randomUUID(), projectId, systemId: p.systemId ? String(p.systemId) : null, packNumber: String(p.packNumber), title: String(p.title), testType: String(p.testType), status: String(p.status ?? "draft"), witnessRequired: Boolean(p.witnessRequired), signedAt: p.signedAt ? String(p.signedAt) : null }).onConflictDoUpdate({ target: [testPacks.projectId, testPacks.packNumber], set: { title: String(p.title), testType: String(p.testType), status: String(p.status ?? "draft"), witnessRequired: Boolean(p.witnessRequired), signedAt: p.signedAt ? String(p.signedAt) : null, updatedAt: new Date().toISOString() } });
      status = "processed";
    } else if (body.eventType === "qms.punch.upsert") {
      const p = body.payload ?? {};
      if (!p.punchNumber || !p.category || !p.description) throw new ApiError(400, "QMS Punch 事件缺少必要字段", "INVALID_PAYLOAD");
      const punchStatus = String(p.status ?? "open");
      await db.insert(punchItems).values({ id: crypto.randomUUID(), projectId, systemId: p.systemId ? String(p.systemId) : null, punchNumber: String(p.punchNumber), category: String(p.category), description: String(p.description), ownerEmail: p.ownerEmail ? String(p.ownerEmail) : null, dueDate: p.dueDate ? String(p.dueDate) : null, status: punchStatus, closedAt: punchStatus === "closed" ? new Date().toISOString() : null }).onConflictDoUpdate({ target: [punchItems.projectId, punchItems.punchNumber], set: { category: String(p.category), description: String(p.description), ownerEmail: p.ownerEmail ? String(p.ownerEmail) : null, dueDate: p.dueDate ? String(p.dueDate) : null, status: punchStatus, closedAt: punchStatus === "closed" ? new Date().toISOString() : null, updatedAt: new Date().toISOString() } });
      status = "processed";
    } else if (body.eventType === "schedule.milestone.upsert") {
      const p = body.payload ?? {};
      if (!p.name || !p.dueAt) throw new ApiError(400, "计划里程碑事件缺少 name 或 dueAt", "INVALID_PAYLOAD");
      const [existingMilestone] = await db.select().from(workflowActions).where(and(eq(workflowActions.projectId, projectId), eq(workflowActions.actionType, "schedule_milestone"), eq(workflowActions.entityId, body.externalId))).limit(1);
      const milestone = { title: String(p.name), status: String(p.status ?? "open"), assignedTo: p.owner ? String(p.owner) : null, dueAt: String(p.dueAt), payloadJson: JSON.stringify(p), updatedAt: new Date().toISOString() };
      if (existingMilestone) await db.update(workflowActions).set(milestone).where(eq(workflowActions.id, existingMilestone.id));
      else await db.insert(workflowActions).values({ id: crypto.randomUUID(), projectId, actionType: "schedule_milestone", title: milestone.title, entityType: "schedule_milestone", entityId: body.externalId, status: milestone.status, assignedTo: milestone.assignedTo, dueAt: milestone.dueAt, payloadJson: milestone.payloadJson, requestedBy: `integration:${body.sourceSystem}` });
      status = "processed";
    } else if (body.eventType === "vendor.equipment_model.upsert") {
      const p = body.payload ?? {};
      if (!p.factoryCode || !p.factoryName || !p.code || !p.name || !p.category || !p.revision || !p.designStandard) throw new ApiError(400, "设备厂型号事件缺少必要字段", "INVALID_PAYLOAD");
      await db.insert(equipmentFactories).values({ id: crypto.randomUUID(), code: String(p.factoryCode), name: String(p.factoryName), country: String(p.country ?? "unknown"), contactEmail: p.contactEmail ? String(p.contactEmail) : null, qualityStatus: String(p.qualityStatus ?? "qualified") }).onConflictDoUpdate({ target: equipmentFactories.code, set: { name: String(p.factoryName), country: String(p.country ?? "unknown"), contactEmail: p.contactEmail ? String(p.contactEmail) : null, qualityStatus: String(p.qualityStatus ?? "qualified"), updatedAt: new Date().toISOString() } });
      const [factory] = await db.select().from(equipmentFactories).where(eq(equipmentFactories.code, String(p.factoryCode))).limit(1);
      await db.insert(equipmentModels).values({ id: crypto.randomUUID(), factoryId: factory.id, code: String(p.code), name: String(p.name), category: String(p.category), revision: String(p.revision), designStandard: String(p.designStandard), status: String(p.status ?? "released") }).onConflictDoUpdate({ target: equipmentModels.code, set: { factoryId: factory.id, name: String(p.name), category: String(p.category), revision: String(p.revision), designStandard: String(p.designStandard), status: String(p.status ?? "released"), updatedAt: new Date().toISOString() } });
      status = "processed";
    } else if (body.eventType === "vendor.equipment_component.upsert") {
      const p = body.payload ?? {};
      if (!p.modelCode || !p.componentCode || !p.componentName || !p.function || !p.medium || !Array.isArray(p.allowedMaterials) || !p.connectionStandard || !p.nominalSize) throw new ApiError(400, "设备内部部件事件缺少必要字段", "INVALID_PAYLOAD");
      const [model] = await db.select().from(equipmentModels).where(eq(equipmentModels.code, String(p.modelCode))).limit(1);
      if (!model) throw new ApiError(409, "请先同步对应设备型号", "MODEL_NOT_FOUND");
      await db.insert(equipmentComponents).values({ id: crypto.randomUUID(), equipmentModelId: model.id, componentCode: String(p.componentCode), componentName: String(p.componentName), function: String(p.function), medium: String(p.medium), allowedMaterialsJson: JSON.stringify(p.allowedMaterials), requiredFinish: String(p.requiredFinish ?? "standard"), requiredCleanliness: String(p.requiredCleanliness ?? "standard"), designPressureMpa: Number(p.designPressureMpa ?? 0), designTemperatureC: Number(p.designTemperatureC ?? 20), connectionStandard: String(p.connectionStandard), nominalSize: String(p.nominalSize), quantity: Number(p.quantity ?? 1), criticality: String(p.criticality ?? "B") }).onConflictDoUpdate({ target: [equipmentComponents.equipmentModelId, equipmentComponents.componentCode], set: { componentName: String(p.componentName), function: String(p.function), medium: String(p.medium), allowedMaterialsJson: JSON.stringify(p.allowedMaterials), requiredFinish: String(p.requiredFinish ?? "standard"), requiredCleanliness: String(p.requiredCleanliness ?? "standard"), designPressureMpa: Number(p.designPressureMpa ?? 0), designTemperatureC: Number(p.designTemperatureC ?? 20), connectionStandard: String(p.connectionStandard), nominalSize: String(p.nominalSize), quantity: Number(p.quantity ?? 1), criticality: String(p.criticality ?? "B"), updatedAt: new Date().toISOString() } });
      status = "processed";    } else if (body.eventType.startsWith("bms.") || body.eventType.startsWith("epms.") || body.eventType.startsWith("scada.")) {
      const p = body.payload ?? {};
      if (!p.tagNo || !p.occurredAt) throw new ApiError(400, "运行事件缺少 tagNo 或 occurredAt", "INVALID_PAYLOAD");
      await db.insert(operationalEvents).values({ id: crypto.randomUUID(), projectId, sourceSystem: body.sourceSystem, tagNo: String(p.tagNo), eventType: body.eventType, severity: String(p.severity ?? "info"), value: p.value === undefined ? null : Number(p.value), unit: p.unit ? String(p.unit) : null, quality: String(p.quality ?? "good"), occurredAt: String(p.occurredAt), payloadJson: JSON.stringify(p) });
      status = "processed";
    }
    const event = { id: eventId, projectId, sourceSystem: body.sourceSystem, eventType: body.eventType, externalId: body.externalId, idempotencyKey, payloadJson: JSON.stringify(body.payload ?? {}), status, retryCount: 0, processedAt: status === "processed" ? new Date().toISOString() : null };
    await db.insert(integrationEvents).values(event);
    if (status === "processed") await db.update(integrationConnectors).set({ cursor: body.externalId, status: "healthy", lastSyncAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), lastError: null, updatedAt: new Date().toISOString() }).where(eq(integrationConnectors.id, connector.id));
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), projectId, actorEmail: `integration:${body.sourceSystem}`, action: `integration.${body.eventType}`, entityType: "integration_event", entityId: eventId, afterJson: JSON.stringify({ sourceSystem: body.sourceSystem, externalId: body.externalId, status }), requestId: requestId(request) });
    return Response.json({ event, duplicate: false }, { status: 202 });
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
    await writeIntegrationAudit(request, principal, before.projectId, body.action, body.id, before, after);
    return Response.json({ event: after });
  } catch (error) { return errorResponse(error); }
}

async function writeIntegrationAudit(request: Request, principal: Awaited<ReturnType<typeof authorize>>, projectId: string | null, action: string | undefined, id: string, before: unknown, after: unknown) {
  const db = getDb();
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), projectId, actorEmail: principal.email, action: "integration_event." + action, entityType: "integration_event", entityId: id, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after), requestId: requestId(request) });
}
