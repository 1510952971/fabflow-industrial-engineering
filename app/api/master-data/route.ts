import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bomItems,
  equipmentComponents,
  equipmentFactories,
  equipmentModels,
  equipmentPorts,
  interfaces,
  materialApprovalRules,
  materialCompatibility,
  materials,
  projects,
  punchItems,
  purchaseOrders,
  systems,
  tags,
  technicalMaterialRules,
  testPacks,
} from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/auth";

type FieldKind = "text" | "number" | "integer" | "boolean" | "json";
type EntityConfig = {
  table: any;
  idColumn: any;
  label: string;
  fields: Record<string, FieldKind>;
  required: string[];
};

const entityConfigs: Record<string, EntityConfig> = {
  projects: {
    table: projects, idColumn: projects.id, label: "项目",
    fields: { code: "text", name: "text", region: "text", fab: "text", phase: "text", status: "text" },
    required: ["code", "name"],
  },
  systems: {
    table: systems, idColumn: systems.id, label: "系统",
    fields: { projectId: "text", code: "text", name: "text", discipline: "text", ownerEmail: "text", designMaturity: "integer", status: "text" },
    required: ["projectId", "code", "name", "discipline"],
  },
  tags: {
    table: tags, idColumn: tags.id, label: "Tag",
    fields: { projectId: "text", systemId: "text", tagNo: "text", entityType: "text", description: "text", designPressureMpa: "number", designTemperatureC: "number", medium: "text", status: "text" },
    required: ["projectId", "systemId", "tagNo", "entityType"],
  },
  interfaces: {
    table: interfaces, idColumn: interfaces.id, label: "接口",
    fields: { projectId: "text", fromTagId: "text", toTagId: "text", interfaceCode: "text", medium: "text", connectionStandard: "text", nominalSize: "text", designPressureMpa: "number", designTemperatureC: "number", cleanlinessGrade: "text", ownerDiscipline: "text", status: "text" },
    required: ["projectId", "interfaceCode", "medium", "connectionStandard", "nominalSize", "designPressureMpa", "designTemperatureC", "ownerDiscipline"],
  },
  materials: {
    table: materials, idColumn: materials.id, label: "材料",
    fields: { manufacturer: "text", code: "text", name: "text", grade: "text", baseMaterial: "text", surfaceFinish: "text", cleanlinessGrade: "text", maxPressureMpa: "number", minTemperatureC: "number", maxTemperatureC: "number", certificationsJson: "json", status: "text" },
    required: ["manufacturer", "code", "name", "grade", "baseMaterial", "surfaceFinish", "cleanlinessGrade", "maxPressureMpa", "minTemperatureC", "maxTemperatureC"],
  },
  materialCompatibility: {
    table: materialCompatibility, idColumn: materialCompatibility.id, label: "介质兼容规则",
    fields: { medium: "text", materialGrade: "text", rating: "text", maxConcentrationPct: "number", maxTemperatureC: "number", notes: "text", sourceStandard: "text" },
    required: ["medium", "materialGrade", "rating", "sourceStandard"],
  },
  equipmentFactories: {
    table: equipmentFactories, idColumn: equipmentFactories.id, label: "设备工厂",
    fields: { code: "text", name: "text", country: "text", contactEmail: "text", qualityStatus: "text" },
    required: ["code", "name", "country"],
  },
  equipmentModels: {
    table: equipmentModels, idColumn: equipmentModels.id, label: "设备型号",
    fields: { factoryId: "text", code: "text", name: "text", category: "text", revision: "text", designStandard: "text", status: "text" },
    required: ["factoryId", "code", "name", "category", "revision", "designStandard"],
  },
  equipmentComponents: {
    table: equipmentComponents, idColumn: equipmentComponents.id, label: "设备内部材料",
    fields: { equipmentModelId: "text", componentCode: "text", componentName: "text", function: "text", medium: "text", allowedMaterialsJson: "json", requiredFinish: "text", requiredCleanliness: "text", designPressureMpa: "number", designTemperatureC: "number", connectionStandard: "text", nominalSize: "text", quantity: "integer", criticality: "text" },
    required: ["equipmentModelId", "componentCode", "componentName", "function", "medium", "allowedMaterialsJson", "requiredFinish", "requiredCleanliness", "designPressureMpa", "designTemperatureC", "connectionStandard", "nominalSize"],
  },
  equipmentPorts: {
    table: equipmentPorts, idColumn: equipmentPorts.id, label: "设备接口",
    fields: { equipmentModelId: "text", portCode: "text", service: "text", direction: "text", connectionStandard: "text", nominalSize: "text", pressureRatingMpa: "number", temperatureRatingC: "number", faceToFaceMm: "number" },
    required: ["equipmentModelId", "portCode", "service", "direction", "connectionStandard", "nominalSize", "pressureRatingMpa", "temperatureRatingC"],
  },
  technicalRules: {
    table: technicalMaterialRules, idColumn: technicalMaterialRules.id, label: "技术文件规则",
    fields: { ruleCode: "text", packageCode: "text", systemCode: "text", serviceName: "text", mediumCodesJson: "json", approvalRuleCode: "text", requiredGrade: "text", requiredFinish: "text", fittingStandard: "text", valveType: "text", flexibleTubePolicy: "text", doubleContainment: "boolean", nominalSizesJson: "json", restrictions: "text", sourceDocument: "text", sourcePages: "text", sourceClause: "text", status: "text" },
    required: ["ruleCode", "packageCode", "systemCode", "serviceName", "mediumCodesJson", "requiredGrade", "requiredFinish", "fittingStandard", "valveType", "sourceDocument", "sourcePages", "sourceClause"],
  },
  brandRules: {
    table: materialApprovalRules, idColumn: materialApprovalRules.id, label: "品牌报审规则",
    fields: { ruleCode: "text", packageCode: "text", categoryCode: "text", itemName: "text", requiredGrade: "text", allowedBrandsJson: "json", restrictions: "text", sourceDocument: "text", sourcePage: "text", status: "text" },
    required: ["ruleCode", "packageCode", "categoryCode", "itemName", "requiredGrade", "allowedBrandsJson", "sourceDocument", "sourcePage"],
  },
  bomItems: {
    table: bomItems, idColumn: bomItems.id, label: "BOM 条目",
    fields: { projectId: "text", systemId: "text", materialId: "text", itemCode: "text", itemName: "text", specification: "text", quantity: "number", unit: "text", unitPriceCny: "number", wastePct: "number", sourceType: "text", sourceId: "text", status: "text" },
    required: ["projectId", "itemCode", "itemName", "quantity", "unit"],
  },
  purchaseOrders: {
    table: purchaseOrders, idColumn: purchaseOrders.id, label: "采购订单",
    fields: { projectId: "text", poNumber: "text", supplier: "text", packageCode: "text", amountCny: "number", promisedDate: "text", status: "text", sourceSystem: "text", externalId: "text" },
    required: ["projectId", "poNumber", "supplier", "packageCode"],
  },
  testPacks: {
    table: testPacks, idColumn: testPacks.id, label: "测试包",
    fields: { projectId: "text", systemId: "text", packNumber: "text", title: "text", testType: "text", status: "text", witnessRequired: "boolean", signedAt: "text" },
    required: ["projectId", "packNumber", "title", "testType"],
  },
  punchItems: {
    table: punchItems, idColumn: punchItems.id, label: "Punch",
    fields: { projectId: "text", systemId: "text", punchNumber: "text", category: "text", description: "text", ownerEmail: "text", dueDate: "text", status: "text", closedAt: "text" },
    required: ["projectId", "punchNumber", "category", "description"],
  },
};

function getConfig(entity: string | null) {
  if (!entity || !entityConfigs[entity]) throw new ApiError(400, "不支持的数据类型", "INVALID_ENTITY");
  return entityConfigs[entity];
}

function normalizeJson(value: unknown) {
  if (Array.isArray(value) || (value !== null && typeof value === "object")) return JSON.stringify(value);
  if (typeof value !== "string") return "[]";
  const text = value.trim();
  if (!text) return "[]";
  try { return JSON.stringify(JSON.parse(text)); } catch {
    return JSON.stringify(text.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean));
  }
}

function normalizeData(config: EntityConfig, input: unknown, partial = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "数据格式无效", "INVALID_INPUT");
  const source = input as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [field, kind] of Object.entries(config.fields)) {
    if (!(field in source)) continue;
    const value = source[field];
    if (kind === "json") output[field] = normalizeJson(value);
    else if (kind === "boolean") output[field] = value === true || value === 1 || value === "1" || value === "true";
    else if (kind === "number" || kind === "integer") {
      if (value === "" || value === null || value === undefined) output[field] = null;
      else {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new ApiError(400, `${field} 必须是有效数字`, "INVALID_NUMBER");
        output[field] = kind === "integer" ? Math.round(number) : number;
      }
    } else output[field] = value === null || value === undefined ? null : String(value).trim();
  }
  if (Object.keys(output).length === 0) throw new ApiError(400, "没有可保存的字段", "EMPTY_UPDATE");
  for (const field of config.required) {
    const value = partial && !(field in output) ? source[field] : output[field];
    if (!partial && (value === undefined || value === null || value === "")) throw new ApiError(400, `${field} 为必填项`, "REQUIRED_FIELD");
    if (partial && field in output && (output[field] === null || output[field] === "")) throw new ApiError(400, `${field} 不能清空`, "REQUIRED_FIELD");
  }
  return output;
}

function projectIdFor(entity: string, row: Record<string, unknown>) {
  if (typeof row.projectId === "string") return row.projectId;
  return entity === "projects" && typeof row.id === "string" ? row.id : null;
}

function canWrite(roles: string[]) {
  return roles.some((role) => ["platform_admin", "project_manager", "system_owner", "equipment_engineer"].includes(role));
}

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "data:read");
    const url = new URL(request.url);
    const requested = (url.searchParams.get("entities") ?? url.searchParams.get("entity") ?? "projects")
      .split(",").map((value) => value.trim()).filter(Boolean);
    const uniqueEntities = [...new Set(requested)];
    if (uniqueEntities.length > 20) throw new ApiError(400, "一次最多读取 20 类数据", "TOO_MANY_ENTITIES");
    const data: Record<string, unknown[]> = {};
    const db = getDb();
    for (const entity of uniqueEntities) {
      const config = getConfig(entity);
      data[entity] = await db.select().from(config.table).limit(500);
    }
    return Response.json({ data, principal, permissions: { canWrite: canWrite(principal.roles) } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "data:write");
    const body = await request.json() as { entity?: string; data?: unknown };
    const entity = body.entity ?? "";
    const config = getConfig(entity);
    const values = normalizeData(config, body.data);
    const row = { id: crypto.randomUUID(), ...values } as Record<string, unknown>;
    const db = getDb();
    await db.insert(config.table).values(row);
    const [created] = await db.select().from(config.table).where(eq(config.idColumn, row.id)).limit(1);
    await writeAudit(request, principal, { projectId: projectIdFor(entity, row), action: `${entity}.create`, entityType: entity, entityId: String(row.id), after: created ?? row });
    return Response.json({ item: created ?? row }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const principal = await authorize(request, "data:write");
    const body = await request.json() as { entity?: string; id?: string; data?: unknown };
    const entity = body.entity ?? "";
    const config = getConfig(entity);
    if (!body.id) throw new ApiError(400, "记录 ID 缺失", "INVALID_INPUT");
    const db = getDb();
    const [before] = await db.select().from(config.table).where(eq(config.idColumn, body.id)).limit(1) as Record<string, unknown>[];
    if (!before) throw new ApiError(404, `${config.label}记录不存在`, "NOT_FOUND");
    const values = normalizeData(config, body.data, true);
    await db.update(config.table).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(config.idColumn, body.id));
    const [after] = await db.select().from(config.table).where(eq(config.idColumn, body.id)).limit(1);
    await writeAudit(request, principal, { projectId: projectIdFor(entity, before), action: `${entity}.update`, entityType: entity, entityId: body.id, before, after });
    return Response.json({ item: after });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const principal = await authorize(request, "data:write");
    const body = await request.json() as { entity?: string; id?: string };
    const entity = body.entity ?? "";
    const config = getConfig(entity);
    if (!body.id) throw new ApiError(400, "记录 ID 缺失", "INVALID_INPUT");
    const db = getDb();
    const [before] = await db.select().from(config.table).where(eq(config.idColumn, body.id)).limit(1) as Record<string, unknown>[];
    if (!before) throw new ApiError(404, `${config.label}记录不存在`, "NOT_FOUND");
    try { await db.delete(config.table).where(eq(config.idColumn, body.id)); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/foreign key|constraint/i.test(message)) throw new ApiError(409, "该记录仍被下级数据引用，请先解除关联", "IN_USE");
      throw error;
    }
    await writeAudit(request, principal, { projectId: projectIdFor(entity, before), action: `${entity}.delete`, entityType: entity, entityId: body.id, before });
    return Response.json({ id: body.id, deleted: true });
  } catch (error) { return errorResponse(error); }
}
