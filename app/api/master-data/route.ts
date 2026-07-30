import { and, asc, count, desc, eq, inArray, like, or } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { getDb } from "@/db";
import {
  bomItems,
  constructionWorkPackages,
  equipmentComponents,
  equipmentFactories,
  equipmentModels,
  equipmentPorts,
  catalogProducts,
  catalogCandidates,
  productApplications,
  productCategories,
  productParameterDefinitions,
  productVariants,
  projectProductRequirements,
  interfaces,
  materialApprovalRules,
  materialCompatibility,
  materials,
  managementOfChanges,
  projects,
  punchItems,
  purchaseOrders,
  releaseGates,
  systems,
  tags,
  technicalMaterialRules,
  testPacks,
  workflowActions,
} from "@/db/schema";
import { recordVersions } from "@/db/workflow-schema";
import { ApiError, errorResponse } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { syncCatalogProductFacets } from "@/lib/catalog-facets";
import { assertAuthenticated, assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID, type Principal } from "@/lib/auth";
import { validateProductSpecifications, type ProductParameterDefinition } from "@/lib/product-catalog";

type FieldKind = "text" | "number" | "integer" | "boolean" | "json";
type EntityConfig = {
  // The table map is deliberately closed below; the values are never derived from request text.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  productCategories: {
    table: productCategories, idColumn: productCategories.id, label: "产品分类",
    fields: { code: "text", name: "text", parentCode: "text", discipline: "text", applicableSystemsJson: "json", icon: "text", description: "text", status: "text" },
    required: ["code", "name", "discipline", "applicableSystemsJson"],
  },
  productParameterDefinitions: {
    table: productParameterDefinitions, idColumn: productParameterDefinitions.id, label: "产品参数定义",
    fields: { categoryId: "text", key: "text", label: "text", groupName: "text", dataType: "text", unit: "text", required: "boolean", comparable: "boolean", optionsJson: "json", validationJson: "json", sortOrder: "integer", helpText: "text", status: "text" },
    required: ["categoryId", "key", "label", "groupName", "dataType", "sortOrder"],
  },
  catalogProducts: {
    table: catalogProducts, idColumn: catalogProducts.id, label: "型录产品",
    fields: { categoryId: "text", factoryId: "text", manufacturer: "text", brand: "text", productCode: "text", productName: "text", series: "text", model: "text", description: "text", country: "text", lifecycleStatus: "text", applicableSystemsJson: "json", mediaJson: "json", imagesJson: "json", minPressureMpa: "number", maxPressureMpa: "number", minTemperatureC: "number", maxTemperatureC: "number", nominalSize: "text", connectionStandard: "text", wettedMaterialsJson: "json", surfaceFinish: "text", cleanlinessGrade: "text", maxFlow: "number", flowUnit: "text", supplyVoltage: "text", signalProtocol: "text", ingressProtection: "text", hazardousAreaRating: "text", certificationsJson: "json", standardsJson: "json", specificationsJson: "json", sourceDocument: "text", sourceUrl: "text", sourcePage: "text", revision: "text", status: "text" },
    required: ["categoryId", "manufacturer", "brand", "productCode", "productName", "model", "applicableSystemsJson", "specificationsJson"],
  },
  productVariants: {
    table: productVariants, idColumn: productVariants.id, label: "产品型号变体",
    fields: { productId: "text", sku: "text", optionCode: "text", name: "text", specificationsJson: "json", dimensionsJson: "json", weightKg: "number", leadTimeWeeks: "integer", unitPriceCny: "number", status: "text" },
    required: ["productId", "sku", "name", "specificationsJson", "dimensionsJson"],
  },
  productApplications: {
    table: productApplications, idColumn: productApplications.id, label: "产品系统适用性",
    fields: { productId: "text", systemCode: "text", service: "text", medium: "text", suitability: "text", limitations: "text" },
    required: ["productId", "systemCode", "service", "suitability"],
  },
  projectProductRequirements: {
    table: projectProductRequirements, idColumn: projectProductRequirements.id, label: "项目产品选型要求",
    fields: { projectId: "text", requirementCode: "text", title: "text", systemCode: "text", categoryId: "text", attachmentId: "text", sourceFileName: "text", sourceRevision: "text", medium: "text", designPressureMpa: "number", designTemperatureC: "number", nominalSize: "text", connectionStandard: "text", requiredMaterialsJson: "json", requiredCertificationsJson: "json", requiredStandardsJson: "json", requiredBrandsJson: "json", requiredSpecificationsJson: "json", notes: "text", status: "text", selectedProductId: "text", selectedVariantId: "text", selectionStatus: "text", selectedBy: "text", selectedAt: "text" },
    required: ["projectId", "requirementCode", "title", "systemCode", "categoryId"],
  },
  catalogCandidates: {
    table: catalogCandidates, idColumn: catalogCandidates.id, label: "项目候选产品",
    fields: { projectId: "text", requirementId: "text", candidateCode: "text", proposedProductName: "text", categoryId: "text", manufacturer: "text", brand: "text", model: "text", supplier: "text", rfqNumber: "text", technicalQueryNumber: "text", requirementSnapshotJson: "json", vendorDataJson: "json", promotedProductId: "text", status: "text", assignedTo: "text", createdBy: "text" },
    required: ["projectId", "requirementId", "candidateCode", "proposedProductName", "categoryId", "requirementSnapshotJson", "createdBy"],
  },  technicalRules: {
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
  managementOfChanges: {
    table: managementOfChanges, idColumn: managementOfChanges.id, label: "MOC 变更",
    fields: { projectId: "text", systemId: "text", mocNumber: "text", title: "text", reason: "text", riskLevel: "text", costImpactCny: "number", scheduleImpactDays: "integer", ownerEmail: "text", status: "text" },
    required: ["projectId", "mocNumber", "title", "reason", "riskLevel"],
  },
  constructionWorkPackages: {
    table: constructionWorkPackages, idColumn: constructionWorkPackages.id, label: "施工工作包",
    fields: { projectId: "text", systemId: "text", packageNumber: "text", title: "text", area: "text", ownerEmail: "text", plannedStart: "text", readinessJson: "json", status: "text" },
    required: ["projectId", "packageNumber", "title", "area"],
  },
  workflowActions: {
    table: workflowActions, idColumn: workflowActions.id, label: "工作流动作",
    fields: { projectId: "text", actionType: "text", title: "text", entityType: "text", entityId: "text", status: "text", assignedTo: "text", dueAt: "text", payloadJson: "json", requestedBy: "text", completedAt: "text" },
    required: ["actionType", "title", "requestedBy"],
  },
};

// Project-scoped rows are always filtered and authorized on the server.
// Catalog/rule entities are global reference data and require a global role to edit.
const projectColumns: Record<string, AnySQLiteColumn> = {
  projects: projects.id,
  systems: systems.projectId,
  tags: tags.projectId,
  interfaces: interfaces.projectId,
  bomItems: bomItems.projectId,
  purchaseOrders: purchaseOrders.projectId,
  testPacks: testPacks.projectId,
  punchItems: punchItems.projectId,
  managementOfChanges: managementOfChanges.projectId,
  constructionWorkPackages: constructionWorkPackages.projectId,
  workflowActions: workflowActions.projectId,
  projectProductRequirements: projectProductRequirements.projectId,
  catalogCandidates: catalogCandidates.projectId,
};

const searchFields: Record<string, string[]> = {
  projects: ["code", "name", "fab", "region"],
  systems: ["code", "name", "discipline", "ownerEmail"],
  tags: ["tagNo", "description", "medium"],
  interfaces: ["interfaceCode", "medium", "connectionStandard", "nominalSize", "ownerDiscipline"],
  materials: ["manufacturer", "code", "name", "grade", "baseMaterial"],
  equipmentFactories: ["code", "name", "country", "contactEmail"],
  equipmentModels: ["code", "name", "category", "designStandard"],
  equipmentComponents: ["componentCode", "componentName", "function", "medium"],
  equipmentPorts: ["portCode", "service", "connectionStandard", "nominalSize"],
  productCategories: ["code", "name", "discipline", "description"],
  productParameterDefinitions: ["key", "label", "groupName", "unit", "helpText"],
  catalogProducts: ["manufacturer", "brand", "productCode", "productName", "series", "model", "description", "connectionStandard", "sourceDocument"],
  productVariants: ["sku", "optionCode", "name"],
  productApplications: ["systemCode", "service", "medium", "suitability", "limitations"],
  projectProductRequirements: ["requirementCode", "title", "systemCode", "sourceFileName", "medium", "nominalSize", "connectionStandard", "status", "selectionStatus"],
  catalogCandidates: ["candidateCode", "proposedProductName", "manufacturer", "brand", "model", "supplier", "rfqNumber", "technicalQueryNumber", "status", "assignedTo"],
  technicalRules: ["ruleCode", "packageCode", "systemCode", "serviceName", "sourceDocument"],
  brandRules: ["ruleCode", "packageCode", "itemName", "requiredGrade", "sourceDocument"],
  bomItems: ["itemCode", "itemName", "specification", "sourceType"],
  purchaseOrders: ["poNumber", "supplier", "packageCode", "status"],
  testPacks: ["packNumber", "title", "testType", "status"],
  punchItems: ["punchNumber", "category", "description", "ownerEmail", "status"],
  managementOfChanges: ["mocNumber", "title", "reason", "riskLevel", "status"],
  constructionWorkPackages: ["packageNumber", "title", "area", "ownerEmail", "status"],
  workflowActions: ["actionType", "title", "entityType", "entityId", "status", "assignedTo"],
};

function hasGlobalScope(principal: Principal) {
  return principal.roles.includes("platform_admin") || principal.scopes.some((scope) => scope.type === "global" && scope.id === "*");
}

function requireEntityWriteScope(principal: Principal, entity: string, row: Record<string, unknown>) {
  assertAuthenticated(principal);
  const projectId = projectIdFor(entity, row);
  if (projectColumns[entity]) assertProjectAccess(principal, projectId, true);
  else if (!hasGlobalScope(principal)) throw new ApiError(403, "全局材料、设备和规则目录仅允许全局管理员维护", "GLOBAL_SCOPE_REQUIRED");
}

async function writeVersion(entity: string, row: Record<string, unknown>, operation: string, actorEmail: string) {
  const db = getDb();
  const [{ total }] = await db.select({ total: count() }).from(recordVersions).where(and(eq(recordVersions.entityType, entity), eq(recordVersions.entityId, String(row.id))));
  await db.insert(recordVersions).values({ id: crypto.randomUUID(), projectId: projectIdFor(entity, row), entityType: entity, entityId: String(row.id), version: Number(total) + 1, operation, snapshotJson: JSON.stringify(row), actorEmail });
}

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

async function assertProjectReleasedForPurchase(row: Record<string, unknown>) {
  const projectId = String(row.projectId ?? "");
  const [gate] = await getDb().select().from(releaseGates).where(and(eq(releaseGates.projectId, projectId), eq(releaseGates.gateType, "project_release"), eq(releaseGates.entityType, "projects"), eq(releaseGates.entityId, projectId), eq(releaseGates.status, "frozen"))).limit(1);
  if (!gate) throw new ApiError(409, "项目尚未完成设计与采购发布冻结审批，不能创建或修改采购订单", "PROJECT_RELEASE_REQUIRED");
}
async function assertCatalogProductValid(row: Record<string, unknown>) {
  const categoryId = String(row.categoryId ?? "");
  if (!categoryId) throw new ApiError(400, "产品分类不能为空", "REQUIRED_FIELD");
  const db = getDb();
  const definitions = await db.select().from(productParameterDefinitions).where(eq(productParameterDefinitions.categoryId, categoryId));
  const result = validateProductSpecifications(row.specificationsJson, definitions as ProductParameterDefinition[]);
  if (!result.valid) throw new ApiError(400, result.issues.map((issue) => issue.message).join("；"), "INVALID_PRODUCT_SPECIFICATIONS");
  const minPressure = row.minPressureMpa === null || row.minPressureMpa === undefined ? null : Number(row.minPressureMpa);
  const maxPressure = row.maxPressureMpa === null || row.maxPressureMpa === undefined ? null : Number(row.maxPressureMpa);
  const minTemperature = row.minTemperatureC === null || row.minTemperatureC === undefined ? null : Number(row.minTemperatureC);
  const maxTemperature = row.maxTemperatureC === null || row.maxTemperatureC === undefined ? null : Number(row.maxTemperatureC);
  if (minPressure !== null && maxPressure !== null && minPressure > maxPressure) throw new ApiError(400, "最低压力不能大于最高压力", "INVALID_PRODUCT_RANGE");
  if (minTemperature !== null && maxTemperature !== null && minTemperature > maxTemperature) throw new ApiError(400, "最低温度不能大于最高温度", "INVALID_PRODUCT_RANGE");
}

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "data:read");
    const url = new URL(request.url);
    const requested = (url.searchParams.get("entities") ?? url.searchParams.get("entity") ?? "projects")
      .split(",").map((value) => value.trim()).filter(Boolean);
    const uniqueEntities = [...new Set(requested)];
    if (uniqueEntities.length > 40) throw new ApiError(400, "一次最多读取 40 类数据", "TOO_MANY_ENTITIES");
    const projectId = url.searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get("pageSize") ?? 500) || 500));
    const search = url.searchParams.get("q")?.trim() ?? "";
    const sort = url.searchParams.get("sort")?.trim() ?? "";
    const direction = url.searchParams.get("direction") === "asc" ? "asc" : "desc";
    const allowedProjectIds = principal.scopes.filter((scope) => scope.type === "project").map((scope) => scope.id);
    const data: Record<string, unknown[]> = {};
    const meta: Record<string, { page: number; pageSize: number; total: number }> = {};
    const db = getDb();
    for (const entity of uniqueEntities) {
      const config = getConfig(entity);
      const conditions = [];
      if (entity === "projects") {
        if (!hasGlobalScope(principal) || url.searchParams.get("allProjects") !== "1") {
          const ids = hasGlobalScope(principal) ? [projectId] : allowedProjectIds;
          conditions.push(ids.length ? inArray(projects.id, ids) : eq(projects.id, "__not_available__"));
        }
      } else if (projectColumns[entity]) {
        assertProjectAccess(principal, projectId);
        conditions.push(eq(projectColumns[entity], projectId));
      }
      if (search && searchFields[entity]?.length) {
        const terms = searchFields[entity].map((field) => like(config.table[field], `%${search}%`));
        conditions.push(or(...terms));
      }
      const whereCondition = conditions.length ? and(...conditions) : undefined;
      const orderColumn = sort && (sort in config.fields || sort === "id") ? config.table[sort] : config.idColumn;
      const orderBy = direction === "asc" ? asc(orderColumn) : desc(orderColumn);
      const totalRows = whereCondition
        ? await db.select({ value: count() }).from(config.table).where(whereCondition)
        : await db.select({ value: count() }).from(config.table);
      data[entity] = whereCondition
        ? await db.select().from(config.table).where(whereCondition).orderBy(orderBy).limit(pageSize).offset((page - 1) * pageSize)
        : await db.select().from(config.table).orderBy(orderBy).limit(pageSize).offset((page - 1) * pageSize);
      meta[entity] = { page, pageSize, total: Number(totalRows[0]?.value ?? 0) };
    }
    return Response.json({ data, meta, principal, permissions: { canWrite: principal.authenticated && canWrite(principal.roles), canWriteGlobal: principal.authenticated && hasGlobalScope(principal), canReviewCatalog: principal.authenticated && principal.roles.includes("platform_admin") } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "data:write");
    assertAuthenticated(principal);
    const body = await request.json() as { entity?: string; data?: unknown; items?: unknown[]; action?: string; versionId?: string };
    const entity = body.entity ?? "";
    if (body.action === "restore") {
      if (!body.versionId) throw new ApiError(400, "版本 ID 缺失", "INVALID_INPUT");
      const db = getDb();
      const [version] = await db.select().from(recordVersions).where(eq(recordVersions.id, body.versionId)).limit(1);
      if (!version) throw new ApiError(404, "历史版本不存在", "NOT_FOUND");
      const restoreEntity = version.entityType;
      const restoreConfig = getConfig(restoreEntity);
      const snapshot = JSON.parse(version.snapshotJson) as Record<string, unknown>;
      requireEntityWriteScope(principal, restoreEntity, snapshot);
      const values: Record<string, unknown> = {};
      for (const field of Object.keys(restoreConfig.fields)) if (field in snapshot) values[field] = snapshot[field];
      const [existing] = await db.select().from(restoreConfig.table).where(eq(restoreConfig.idColumn, snapshot.id)).limit(1);
      if (existing) await db.update(restoreConfig.table).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(restoreConfig.idColumn, snapshot.id));
      else await db.insert(restoreConfig.table).values({ id: snapshot.id, ...values });
      const [restored] = await db.select().from(restoreConfig.table).where(eq(restoreConfig.idColumn, snapshot.id)).limit(1);
      await writeVersion(restoreEntity, restored as Record<string, unknown>, "restore", principal.email);
      await writeAudit(request, principal, { projectId: projectIdFor(restoreEntity, snapshot), action: restoreEntity + ".restore", entityType: restoreEntity, entityId: String(snapshot.id), before: existing, after: restored });
      return Response.json({ item: restored, restoredFromVersion: body.versionId });
    }
    const config = getConfig(entity);
    if (entity === "catalogCandidates") throw new ApiError(409, "候选产品必须从项目规格选型页生成，并按 RFQ / TQ / 品牌报审流程维护", "CANDIDATE_WORKFLOW_REQUIRED");
    if (body.items) {
      if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 200) throw new ApiError(400, "批量导入必须包含 1–200 条记录", "INVALID_BATCH");
      const normalized = body.items.map((item) => normalizeData(config, item));
      const db = getDb();
      const created: Record<string, unknown>[] = [];
      for (const values of normalized) {
        if (entity === "catalogProducts" && ["pending_review", "approved"].includes(String(values.status ?? ""))) throw new ApiError(409, "请先保存为草稿，再通过型录审核工作台送审和批准", "CATALOG_REVIEW_REQUIRED");
        const row = { id: crypto.randomUUID(), ...values } as Record<string, unknown>;
        requireEntityWriteScope(principal, entity, row);
        if (entity === "purchaseOrders") await assertProjectReleasedForPurchase(row);
        if (entity === "catalogProducts") await assertCatalogProductValid(row);
        await db.insert(config.table).values(row);
        if (entity === "catalogProducts") await syncCatalogProductFacets(row);
        created.push(row);
        await writeAudit(request, principal, { projectId: projectIdFor(entity, row), action: `${entity}.import`, entityType: entity, entityId: String(row.id), after: row });
      }
      return Response.json({ items: created, imported: created.length }, { status: 201 });
    }
    const values = normalizeData(config, body.data);
    if (entity === "catalogProducts" && ["pending_review", "approved"].includes(String(values.status ?? ""))) throw new ApiError(409, "请先保存为草稿，再通过型录审核工作台送审和批准", "CATALOG_REVIEW_REQUIRED");
    const row = { id: crypto.randomUUID(), ...values } as Record<string, unknown>;
    requireEntityWriteScope(principal, entity, row);
    if (entity === "purchaseOrders") await assertProjectReleasedForPurchase(row);
    if (entity === "catalogProducts") await assertCatalogProductValid(row);
    const db = getDb();
    await db.insert(config.table).values(row);
    const [created] = await db.select().from(config.table).where(eq(config.idColumn, row.id)).limit(1);
    if (entity === "catalogProducts") await syncCatalogProductFacets((created ?? row) as Record<string, unknown>);
    await writeVersion(entity, (created ?? row) as Record<string, unknown>, "create", principal.email);
    await writeAudit(request, principal, { projectId: projectIdFor(entity, row), action: `${entity}.create`, entityType: entity, entityId: String(row.id), after: created ?? row });
    return Response.json({ item: created ?? row }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const principal = await authorize(request, "data:write");
    assertAuthenticated(principal);
    const body = await request.json() as { entity?: string; id?: string; data?: unknown };
    const entity = body.entity ?? "";
    const config = getConfig(entity);
    if (!body.id) throw new ApiError(400, "记录 ID 缺失", "INVALID_INPUT");
    const db = getDb();
    const [before] = await db.select().from(config.table).where(eq(config.idColumn, body.id)).limit(1) as Record<string, unknown>[];
    if (!before) throw new ApiError(404, config.label + "记录不存在", "NOT_FOUND");
    requireEntityWriteScope(principal, entity, before);
    if (entity === "purchaseOrders") await assertProjectReleasedForPurchase(before);
    await writeVersion(entity, before, "before_update", principal.email);
    const values = normalizeData(config, body.data, true);
    if (entity === "catalogProducts" && ["pending_review", "approved"].includes(String(values.status ?? "")) && values.status !== before.status) throw new ApiError(409, "请通过型录审核工作台完成送审和批准", "CATALOG_REVIEW_REQUIRED");
    if (entity === "catalogCandidates") {
      for (const field of ["projectId", "requirementId", "candidateCode", "categoryId", "requirementSnapshotJson", "promotedProductId", "status", "createdBy"]) delete values[field];
      if (before.status === "rfq_preparation" && ["manufacturer", "brand", "model", "supplier", "rfqNumber", "technicalQueryNumber", "vendorDataJson"].some((field) => values[field])) values.status = "vendor_data_received";
    }
    if (entity === "catalogProducts") await assertCatalogProductValid({ ...before, ...values });
    await db.update(config.table).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(config.idColumn, body.id));
    const [after] = await db.select().from(config.table).where(eq(config.idColumn, body.id)).limit(1);
    if (entity === "catalogProducts") await syncCatalogProductFacets(after as Record<string, unknown>);
    await writeVersion(entity, after as Record<string, unknown>, "update", principal.email);
    await writeAudit(request, principal, { projectId: projectIdFor(entity, before), action: `${entity}.update`, entityType: entity, entityId: body.id, before, after });
    return Response.json({ item: after });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const principal = await authorize(request, "data:write");
    assertAuthenticated(principal);
    const body = await request.json() as { entity?: string; id?: string; hard?: boolean };
    const entity = body.entity ?? "";
    const config = getConfig(entity);
    if (!body.id) throw new ApiError(400, "记录 ID 缺失", "INVALID_INPUT");
    const db = getDb();
    const [before] = await db.select().from(config.table).where(eq(config.idColumn, body.id)).limit(1) as Record<string, unknown>[];
    if (!before) throw new ApiError(404, config.label + "记录不存在", "NOT_FOUND");
    requireEntityWriteScope(principal, entity, before);
    await writeVersion(entity, before, body.hard ? "before_hard_delete" : "before_archive", principal.email);
    if (!body.hard && "status" in config.fields) {
      await db.update(config.table).set({ status: "archived", updatedAt: new Date().toISOString() }).where(eq(config.idColumn, body.id));
      const [after] = await db.select().from(config.table).where(eq(config.idColumn, body.id)).limit(1);
      await writeVersion(entity, after as Record<string, unknown>, "archive", principal.email);
      await writeAudit(request, principal, { projectId: projectIdFor(entity, before), action: entity + ".archive", entityType: entity, entityId: body.id, before, after });
      return Response.json({ id: body.id, archived: true, item: after });
    }
    if (body.hard && !principal.roles.includes("platform_admin")) throw new ApiError(403, "彻底删除仅允许平台管理员执行", "FORBIDDEN");
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
