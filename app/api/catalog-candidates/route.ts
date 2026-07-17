import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogCandidates, catalogProducts, projectProductRequirements } from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { assertAuthenticated, assertProjectAccess, authorize } from "@/lib/auth";

async function requirementInProject(projectId: string, requirementId: string) {
  const [row] = await getDb().select().from(projectProductRequirements).where(and(eq(projectProductRequirements.id, requirementId), eq(projectProductRequirements.projectId, projectId))).limit(1);
  if (!row) throw new ApiError(404, "项目选型要求不存在", "REQUIREMENT_NOT_FOUND");
  return row;
}

function canMaintainGlobalCatalog(roles: string[]) { return roles.includes("platform_admin"); }

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "equipment:read");
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() ?? "";
    const requirementId = url.searchParams.get("requirementId")?.trim() ?? "";
    if (!projectId) throw new ApiError(400, "项目不能为空", "INVALID_INPUT");
    assertProjectAccess(principal, projectId);
    const conditions = [eq(catalogCandidates.projectId, projectId)];
    if (requirementId) conditions.push(eq(catalogCandidates.requirementId, requirementId));
    const rows = await getDb().select().from(catalogCandidates).where(and(...conditions)).orderBy(desc(catalogCandidates.createdAt)).limit(200);
    return Response.json({ candidates: rows, permissions: { canPromote: canMaintainGlobalCatalog(principal.roles) } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "equipment:validate");
    assertAuthenticated(principal);
    const body = await request.json() as { action?: string; id?: string; projectId?: string; requirementId?: string; manufacturer?: string; brand?: string; model?: string; supplier?: string; rfqNumber?: string; technicalQueryNumber?: string; vendorData?: Record<string, unknown>; assignedTo?: string };
    const projectId = body.projectId?.trim() ?? "";
    if (!projectId) throw new ApiError(400, "项目不能为空", "INVALID_INPUT");
    assertProjectAccess(principal, projectId, true);
    const db = getDb();

    if (body.action === "create") {
      if (!body.requirementId) throw new ApiError(400, "选型要求不能为空", "INVALID_INPUT");
      const requirement = await requirementInProject(projectId, body.requirementId);
      const existing = await db.select().from(catalogCandidates).where(eq(catalogCandidates.requirementId, requirement.id));
      const candidateCode = `${requirement.requirementCode}-C${String(existing.length + 1).padStart(2, "0")}`;
      const row = {
        id: crypto.randomUUID(), projectId, requirementId: requirement.id, candidateCode,
        proposedProductName: requirement.title, categoryId: requirement.categoryId,
        manufacturer: "", brand: "", model: "", supplier: "", rfqNumber: "", technicalQueryNumber: "",
        requirementSnapshotJson: JSON.stringify(requirement), vendorDataJson: "{}", status: "rfq_preparation",
        assignedTo: principal.email, createdBy: principal.email,
      };
      await db.insert(catalogCandidates).values(row);
      await writeAudit(request, principal, { projectId, action: "catalog_candidate.create", entityType: "catalogCandidates", entityId: row.id, after: row });
      return Response.json({ candidate: row }, { status: 201 });
    }

    if (!body.id) throw new ApiError(400, "候选记录 ID 不能为空", "INVALID_INPUT");
    const [before] = await db.select().from(catalogCandidates).where(and(eq(catalogCandidates.id, body.id), eq(catalogCandidates.projectId, projectId))).limit(1);
    if (!before) throw new ApiError(404, "候选产品不存在", "NOT_FOUND");

    if (body.action === "save_vendor_data") {
      const values = {
        manufacturer: body.manufacturer?.trim() ?? before.manufacturer,
        brand: body.brand?.trim() ?? before.brand,
        model: body.model?.trim() ?? before.model,
        supplier: body.supplier?.trim() ?? before.supplier,
        rfqNumber: body.rfqNumber?.trim() ?? before.rfqNumber,
        technicalQueryNumber: body.technicalQueryNumber?.trim() ?? before.technicalQueryNumber,
        vendorDataJson: JSON.stringify(body.vendorData ?? JSON.parse(before.vendorDataJson || "{}")),
        assignedTo: body.assignedTo?.trim() || before.assignedTo,
        status: "vendor_data_received",
        updatedAt: new Date().toISOString(),
      };
      await db.update(catalogCandidates).set(values).where(eq(catalogCandidates.id, before.id));
      await writeAudit(request, principal, { projectId, action: "catalog_candidate.vendor_data", entityType: "catalogCandidates", entityId: before.id, before, after: values });
      return Response.json({ candidate: { ...before, ...values } });
    }

    if (body.action === "submit_review") {

      if (before.status !== "vendor_data_received") throw new ApiError(409, "候选产品尚未完成供应商数据录入", "INVALID_CANDIDATE_TRANSITION");
      if (!before.manufacturer || !before.brand || !before.model) throw new ApiError(409, "请先补齐制造商、品牌和型号", "VENDOR_DATA_REQUIRED");
      const values = { status: "technical_review", updatedAt: new Date().toISOString() };
      await db.update(catalogCandidates).set(values).where(eq(catalogCandidates.id, before.id));
      await writeAudit(request, principal, { projectId, action: "catalog_candidate.submit_review", entityType: "catalogCandidates", entityId: before.id, before, after: values });
      return Response.json({ candidate: { ...before, ...values } });
    }

    if (body.action === "mark_ready") {

      if (!["technical_review", "brand_approval"].includes(before.status)) throw new ApiError(409, "候选产品尚未进入技术审查或品牌报审", "INVALID_CANDIDATE_TRANSITION");
      const values = { status: "ready_for_catalog", updatedAt: new Date().toISOString() };
      await db.update(catalogCandidates).set(values).where(eq(catalogCandidates.id, before.id));
      await writeAudit(request, principal, { projectId, action: "catalog_candidate.ready", entityType: "catalogCandidates", entityId: before.id, before, after: values });
      return Response.json({ candidate: { ...before, ...values } });
    }

    if (body.action === "promote") {
      if (!canMaintainGlobalCatalog(principal.roles)) throw new ApiError(403, "只有平台管理员可以将项目候选转入全局型录", "GLOBAL_SCOPE_REQUIRED");
      if (before.status !== "ready_for_catalog") throw new ApiError(409, "候选产品尚未完成技术审查与品牌报审", "CANDIDATE_NOT_READY");
      const requirement = await requirementInProject(projectId, before.requirementId);
      if (!before.manufacturer || !before.brand || !before.model) throw new ApiError(409, "制造商、品牌和型号不能为空", "VENDOR_DATA_REQUIRED");
      const productId = crypto.randomUUID();
      const product = {
        id: productId, categoryId: before.categoryId, manufacturer: before.manufacturer, brand: before.brand,
        productCode: `CAND-${projectId.slice(0, 8).toUpperCase()}-${before.candidateCode}`, productName: before.proposedProductName, model: before.model,
        description: `由项目 ${projectId} 规格要求 ${requirement.requirementCode} 候选转入，待全局型录管理员复核发布`,
        lifecycleStatus: "active", applicableSystemsJson: JSON.stringify([requirement.systemCode]), mediaJson: requirement.medium ? JSON.stringify([requirement.medium]) : "[]", imagesJson: "[]",
        minPressureMpa: null, maxPressureMpa: requirement.designPressureMpa, minTemperatureC: null, maxTemperatureC: requirement.designTemperatureC,
        nominalSize: requirement.nominalSize || null, connectionStandard: requirement.connectionStandard || null,
        wettedMaterialsJson: requirement.requiredMaterialsJson, certificationsJson: requirement.requiredCertificationsJson,
        standardsJson: requirement.requiredStandardsJson, specificationsJson: requirement.requiredSpecificationsJson,
        sourceDocument: requirement.sourceFileName, revision: requirement.sourceRevision, status: "pending_review",
      };
      await db.insert(catalogProducts).values(product);
      const values = { promotedProductId: productId, status: "promoted", updatedAt: new Date().toISOString() };
      await db.update(catalogCandidates).set(values).where(eq(catalogCandidates.id, before.id));
      await writeAudit(request, principal, { projectId, action: "catalog_candidate.promote", entityType: "catalogProducts", entityId: productId, before, after: product });
      return Response.json({ candidate: { ...before, ...values }, product }, { status: 201 });
    }

    throw new ApiError(400, "不支持的候选产品动作", "INVALID_ACTION");
  } catch (error) { return errorResponse(error); }
}