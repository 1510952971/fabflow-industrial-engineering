import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs, equipmentComponents, equipmentFactories, equipmentModels, integrationEvents,
  operationalEvents, punchItems, purchaseOrders, testPacks, workflowActions,
} from "@/db/schema";
import { integrationConnectors } from "@/db/workflow-schema";
import { ApiError } from "./api";

export type IntegrationPayload = {
  sourceSystem: string;
  eventType: string;
  externalId: string;
  projectId: string;
  payload: Record<string, unknown>;
};

function requireFields(payload: Record<string, unknown>, fields: string[], label: string) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === "");
  if (missing.length) throw new ApiError(422, `${label} 缺少字段：${missing.join("、")}`, "INVALID_PAYLOAD");
}

export async function processIntegrationPayload(body: IntegrationPayload, idempotencyKey: string, requestIdValue: string) {
  const db = getDb();
  const [existing] = await db.select().from(integrationEvents).where(eq(integrationEvents.idempotencyKey, idempotencyKey)).limit(1);
  if (existing) return { event: existing, duplicate: true };
  const [connector] = await db.select().from(integrationConnectors).where(and(
    eq(integrationConnectors.projectId, body.projectId),
    eq(integrationConnectors.sourceSystem, body.sourceSystem),
  )).limit(1);
  if (!connector?.enabled) throw new ApiError(403, "此项目未启用对应数据源连接器", "CONNECTOR_NOT_ENABLED");

  const p = body.payload;
  if (body.eventType === "erp.po.upsert") {
    requireFields(p, ["poNumber", "supplier", "packageCode"], "ERP PO 事件");
    await db.insert(purchaseOrders).values({
      id: crypto.randomUUID(), projectId: body.projectId, poNumber: String(p.poNumber), supplier: String(p.supplier),
      packageCode: String(p.packageCode), amountCny: Number(p.amountCny ?? 0), promisedDate: p.promisedDate ? String(p.promisedDate) : null,
      status: String(p.status ?? "placed"), sourceSystem: body.sourceSystem, externalId: body.externalId,
    }).onConflictDoUpdate({ target: [purchaseOrders.projectId, purchaseOrders.poNumber], set: {
      supplier: String(p.supplier), packageCode: String(p.packageCode), amountCny: Number(p.amountCny ?? 0),
      promisedDate: p.promisedDate ? String(p.promisedDate) : null, status: String(p.status ?? "placed"),
      sourceSystem: body.sourceSystem, externalId: body.externalId, updatedAt: new Date().toISOString(),
    } });
  } else if (body.eventType === "qms.test_pack.upsert") {
    requireFields(p, ["packNumber", "title", "testType"], "QMS 试验包事件");
    await db.insert(testPacks).values({
      id: crypto.randomUUID(), projectId: body.projectId, systemId: p.systemId ? String(p.systemId) : null,
      packNumber: String(p.packNumber), title: String(p.title), testType: String(p.testType), status: String(p.status ?? "draft"),
      witnessRequired: Boolean(p.witnessRequired), signedAt: p.signedAt ? String(p.signedAt) : null,
    }).onConflictDoUpdate({ target: [testPacks.projectId, testPacks.packNumber], set: {
      title: String(p.title), testType: String(p.testType), status: String(p.status ?? "draft"),
      witnessRequired: Boolean(p.witnessRequired), signedAt: p.signedAt ? String(p.signedAt) : null,
      updatedAt: new Date().toISOString(),
    } });
  } else if (body.eventType === "qms.punch.upsert") {
    requireFields(p, ["punchNumber", "category", "description"], "QMS Punch 事件");
    const status = String(p.status ?? "open");
    await db.insert(punchItems).values({
      id: crypto.randomUUID(), projectId: body.projectId, systemId: p.systemId ? String(p.systemId) : null,
      punchNumber: String(p.punchNumber), category: String(p.category), description: String(p.description),
      ownerEmail: p.ownerEmail ? String(p.ownerEmail) : null, dueDate: p.dueDate ? String(p.dueDate) : null,
      status, closedAt: status === "closed" ? new Date().toISOString() : null,
    }).onConflictDoUpdate({ target: [punchItems.projectId, punchItems.punchNumber], set: {
      category: String(p.category), description: String(p.description), ownerEmail: p.ownerEmail ? String(p.ownerEmail) : null,
      dueDate: p.dueDate ? String(p.dueDate) : null, status,
      closedAt: status === "closed" ? new Date().toISOString() : null, updatedAt: new Date().toISOString(),
    } });
  } else if (body.eventType === "schedule.milestone.upsert") {
    requireFields(p, ["name", "dueAt"], "计划里程碑事件");
    const [existingMilestone] = await db.select().from(workflowActions).where(and(
      eq(workflowActions.projectId, body.projectId), eq(workflowActions.actionType, "schedule_milestone"),
      eq(workflowActions.entityId, body.externalId),
    )).limit(1);
    const milestone = {
      title: String(p.name), status: String(p.status ?? "open"), assignedTo: p.owner ? String(p.owner) : null,
      dueAt: String(p.dueAt), payloadJson: JSON.stringify(p), updatedAt: new Date().toISOString(),
    };
    if (existingMilestone) await db.update(workflowActions).set(milestone).where(eq(workflowActions.id, existingMilestone.id));
    else await db.insert(workflowActions).values({
      id: crypto.randomUUID(), projectId: body.projectId, actionType: "schedule_milestone", title: milestone.title,
      entityType: "schedule_milestone", entityId: body.externalId, status: milestone.status,
      assignedTo: milestone.assignedTo, dueAt: milestone.dueAt, payloadJson: milestone.payloadJson,
      requestedBy: `integration:${body.sourceSystem}`,
    });
  } else if (body.eventType === "vendor.equipment_model.upsert") {
    requireFields(p, ["factoryCode", "factoryName", "code", "name", "category", "revision", "designStandard"], "设备厂型号事件");
    await db.insert(equipmentFactories).values({
      id: crypto.randomUUID(), code: String(p.factoryCode), name: String(p.factoryName), country: String(p.country ?? "unknown"),
      contactEmail: p.contactEmail ? String(p.contactEmail) : null, qualityStatus: String(p.qualityStatus ?? "qualified"),
    }).onConflictDoUpdate({ target: equipmentFactories.code, set: {
      name: String(p.factoryName), country: String(p.country ?? "unknown"),
      contactEmail: p.contactEmail ? String(p.contactEmail) : null, qualityStatus: String(p.qualityStatus ?? "qualified"),
      updatedAt: new Date().toISOString(),
    } });
    const [factory] = await db.select().from(equipmentFactories).where(eq(equipmentFactories.code, String(p.factoryCode))).limit(1);
    await db.insert(equipmentModels).values({
      id: crypto.randomUUID(), factoryId: factory.id, code: String(p.code), name: String(p.name), category: String(p.category),
      revision: String(p.revision), designStandard: String(p.designStandard), status: String(p.status ?? "released"),
    }).onConflictDoUpdate({ target: equipmentModels.code, set: {
      factoryId: factory.id, name: String(p.name), category: String(p.category), revision: String(p.revision),
      designStandard: String(p.designStandard), status: String(p.status ?? "released"), updatedAt: new Date().toISOString(),
    } });
  } else if (body.eventType === "vendor.equipment_component.upsert") {
    requireFields(p, ["modelCode", "componentCode", "componentName", "function", "medium", "allowedMaterials", "connectionStandard", "nominalSize"], "设备内部部件事件");
    if (!Array.isArray(p.allowedMaterials)) throw new ApiError(422, "allowedMaterials 必须是数组", "INVALID_PAYLOAD");
    const [model] = await db.select().from(equipmentModels).where(eq(equipmentModels.code, String(p.modelCode))).limit(1);
    if (!model) throw new ApiError(409, "请先同步对应设备型号", "MODEL_NOT_FOUND");
    await db.insert(equipmentComponents).values({
      id: crypto.randomUUID(), equipmentModelId: model.id, componentCode: String(p.componentCode),
      componentName: String(p.componentName), function: String(p.function), medium: String(p.medium),
      allowedMaterialsJson: JSON.stringify(p.allowedMaterials), requiredFinish: String(p.requiredFinish ?? "standard"),
      requiredCleanliness: String(p.requiredCleanliness ?? "standard"), designPressureMpa: Number(p.designPressureMpa ?? 0),
      designTemperatureC: Number(p.designTemperatureC ?? 20), connectionStandard: String(p.connectionStandard),
      nominalSize: String(p.nominalSize), quantity: Number(p.quantity ?? 1), criticality: String(p.criticality ?? "B"),
    }).onConflictDoUpdate({ target: [equipmentComponents.equipmentModelId, equipmentComponents.componentCode], set: {
      componentName: String(p.componentName), function: String(p.function), medium: String(p.medium),
      allowedMaterialsJson: JSON.stringify(p.allowedMaterials), requiredFinish: String(p.requiredFinish ?? "standard"),
      requiredCleanliness: String(p.requiredCleanliness ?? "standard"), designPressureMpa: Number(p.designPressureMpa ?? 0),
      designTemperatureC: Number(p.designTemperatureC ?? 20), connectionStandard: String(p.connectionStandard),
      nominalSize: String(p.nominalSize), quantity: Number(p.quantity ?? 1), criticality: String(p.criticality ?? "B"),
      updatedAt: new Date().toISOString(),
    } });
  } else if (/^(bms|epms|scada)\./.test(body.eventType)) {
    requireFields(p, ["tagNo", "occurredAt"], "运行事件");
    await db.insert(operationalEvents).values({
      id: crypto.randomUUID(), projectId: body.projectId, sourceSystem: body.sourceSystem, tagNo: String(p.tagNo),
      eventType: body.eventType, severity: String(p.severity ?? "info"), value: p.value === undefined ? null : Number(p.value),
      unit: p.unit ? String(p.unit) : null, quality: String(p.quality ?? "good"), occurredAt: String(p.occurredAt),
      payloadJson: JSON.stringify(p),
    });
  } else {
    throw new ApiError(422, `不支持的集成事件类型：${body.eventType}`, "UNSUPPORTED_EVENT_TYPE");
  }

  const now = new Date().toISOString();
  const event = {
    id: crypto.randomUUID(), projectId: body.projectId, sourceSystem: body.sourceSystem, eventType: body.eventType,
    externalId: body.externalId, idempotencyKey, payloadJson: JSON.stringify(p), status: "processed",
    retryCount: 0, processedAt: now,
  };
  await db.insert(integrationEvents).values(event);
  await db.update(integrationConnectors).set({
    cursor: body.externalId, status: "healthy", lastSyncAt: now, lastSuccessAt: now, lastError: null, updatedAt: now,
  }).where(eq(integrationConnectors.id, connector.id));
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(), projectId: body.projectId, actorEmail: `integration:${body.sourceSystem}`,
    action: `integration.${body.eventType}`, entityType: "integration_event", entityId: event.id,
    afterJson: JSON.stringify({ sourceSystem: body.sourceSystem, externalId: body.externalId, status: event.status }),
    requestId: requestIdValue,
  });
  return { event, duplicate: false };
}
