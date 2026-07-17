import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  approvalRequests, attachments, bomItems, catalogSelectionResults, catalogSelectionRuns, equipmentComponents,
  equipmentMaterialSelections, interfaces, projectProductRequirements, releaseGates, technicalSpecExtractions,
} from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { assertAuthenticated, assertProjectAccess, authorize } from "@/lib/auth";

type GateType = "catalog_selection" | "equipment_bom" | "project_release";
type Snapshot = { blockers: string[]; warnings: string[]; evidence: Record<string, unknown> };

const workflow: Record<GateType, { title: string; steps: string[] }> = {
  catalog_selection: { title: "项目产品选型冻结", steps: ["设备工程师", "系统负责人", "QA/QC"] },
  equipment_bom: { title: "设备内部 BOM 冻结", steps: ["设备工程师", "系统负责人", "QA/QC", "项目经理"] },
  project_release: { title: "项目设计与采购发布", steps: ["系统负责人", "QA/QC", "项目经理"] },
};

async function validateGate(projectId: string, gateType: GateType, entityId: string): Promise<Snapshot> {
  const db = getDb();
  const snapshot: Snapshot = { blockers: [], warnings: [], evidence: {} };
  if (gateType === "catalog_selection") {
    const [requirement] = await db.select().from(projectProductRequirements).where(and(eq(projectProductRequirements.id, entityId), eq(projectProductRequirements.projectId, projectId))).limit(1);
    if (!requirement) throw new ApiError(404, "项目选型要求不存在", "NOT_FOUND");
    if (!requirement.attachmentId) snapshot.blockers.push("未关联项目技术规格书");
    if (requirement.selectionStatus !== "selected" || !requirement.selectedProductId) snapshot.blockers.push("尚未完成合格产品选用");
    const [extraction] = await db.select().from(technicalSpecExtractions).where(and(eq(technicalSpecExtractions.projectId, projectId), eq(technicalSpecExtractions.requirementId, requirement.id))).orderBy(desc(technicalSpecExtractions.createdAt)).limit(1);
    if (!extraction) snapshot.blockers.push("规格书尚未形成结构化提取记录");
    else if (extraction.status !== "confirmed") snapshot.blockers.push("规格书提取结果尚未人工确认");
    const [run] = await db.select().from(catalogSelectionRuns).where(and(eq(catalogSelectionRuns.projectId, projectId), eq(catalogSelectionRuns.requirementId, requirement.id))).orderBy(desc(catalogSelectionRuns.createdAt)).limit(1);
    const [result] = run && requirement.selectedProductId ? await db.select().from(catalogSelectionResults).where(and(eq(catalogSelectionResults.runId, run.id), eq(catalogSelectionResults.productId, requirement.selectedProductId))).limit(1) : [undefined];
    if (!result) snapshot.blockers.push("选用产品缺少最新匹配校验证据");
    else if (result.status === "blocked") snapshot.blockers.push("选用产品存在致命不符合项");
    else if (result.status === "attention") snapshot.warnings.push("选用产品存在需审批确认的警告项");
    snapshot.evidence = { requirementId: requirement.id, attachmentId: requirement.attachmentId, sourceRevision: requirement.sourceRevision, extractionId: extraction?.id, selectedProductId: requirement.selectedProductId, selectionRunId: run?.id, resultStatus: result?.status };
  }

  if (gateType === "equipment_bom") {
    const components = await db.select().from(equipmentComponents).where(eq(equipmentComponents.equipmentModelId, entityId));
    if (!components.length) snapshot.blockers.push("设备型号未录入内部 BOM 部件");
    const selections = await db.select().from(equipmentMaterialSelections).where(and(eq(equipmentMaterialSelections.projectId, projectId), eq(equipmentMaterialSelections.equipmentModelId, entityId)));
    if (selections.length !== components.length) snapshot.blockers.push(`整机配材不完整：${selections.length}/${components.length}`);
    const blocked = selections.filter((item) => item.status === "blocked");
    const attention = selections.filter((item) => item.status === "attention");
    if (blocked.length) snapshot.blockers.push(`${blocked.length} 个内部部件存在致命不符合`);
    if (attention.length) snapshot.warnings.push(`${attention.length} 个内部部件需带条件审批`);
    const evidenceFiles = await db.select().from(attachments).where(and(eq(attachments.projectId, projectId), eq(attachments.entityType, "equipment_model"), eq(attachments.entityId, entityId), eq(attachments.status, "active")));
    if (!evidenceFiles.length) snapshot.blockers.push("未上传设备内部 BOM、接口图或材质证明等设备厂文件");
    const equipmentBom = await db.select().from(bomItems).where(and(eq(bomItems.projectId, projectId), eq(bomItems.sourceType, "equipment_internal_selection")));
    const modelBom = equipmentBom.filter((item) => (item.sourceId ?? "").startsWith(`equipment:${entityId}:`));
    if (modelBom.length !== components.length) snapshot.blockers.push("尚未从整机校验结果生成完整项目 BOM");
    snapshot.evidence = { equipmentModelId: entityId, componentCount: components.length, selectionCount: selections.length, attachmentIds: evidenceFiles.map((item) => item.id), bomItemIds: modelBom.map((item) => item.id), runIds: selections.map((item) => item.runId) };
  }

  if (gateType === "project_release") {
    const requirements = await db.select().from(projectProductRequirements).where(and(eq(projectProductRequirements.projectId, projectId), ne(projectProductRequirements.status, "archived")));
    const incomplete = requirements.filter((item) => item.selectionStatus !== "selected");
    if (incomplete.length) snapshot.blockers.push(`${incomplete.length} 项技术规格选型尚未完成`);
    const requirementIds = requirements.map((item) => item.id);
    const frozenCatalogGates = requirementIds.length ? await db.select().from(releaseGates).where(and(eq(releaseGates.projectId, projectId), eq(releaseGates.gateType, "catalog_selection"), eq(releaseGates.status, "frozen"), inArray(releaseGates.entityId, requirementIds))) : [];
    if (frozenCatalogGates.length !== requirements.length) snapshot.blockers.push(`选型冻结不完整：${frozenCatalogGates.length}/${requirements.length}`);
    const openInterfaces = await db.select().from(interfaces).where(and(eq(interfaces.projectId, projectId), ne(interfaces.status, "closed"), ne(interfaces.status, "frozen")));
    if (openInterfaces.length) snapshot.blockers.push(`${openInterfaces.length} 个项目接口尚未关闭或冻结`);
    const blockedEquipment = await db.select().from(equipmentMaterialSelections).where(and(eq(equipmentMaterialSelections.projectId, projectId), eq(equipmentMaterialSelections.status, "blocked")));
    if (blockedEquipment.length) snapshot.blockers.push(`${blockedEquipment.length} 个设备内部材料选型被阻断`);
    const projectBom = await db.select().from(bomItems).where(eq(bomItems.projectId, projectId));
    if (!projectBom.length) snapshot.blockers.push("项目 BOM 为空");
    const equipmentModelIds = [...new Set((await db.select().from(equipmentMaterialSelections).where(eq(equipmentMaterialSelections.projectId, projectId))).map((item) => item.equipmentModelId))];
    const frozenEquipmentGates = equipmentModelIds.length ? await db.select().from(releaseGates).where(and(eq(releaseGates.projectId, projectId), eq(releaseGates.gateType, "equipment_bom"), eq(releaseGates.status, "frozen"), inArray(releaseGates.entityId, equipmentModelIds))) : [];
    if (frozenEquipmentGates.length !== equipmentModelIds.length) snapshot.blockers.push(`设备 BOM 冻结不完整：${frozenEquipmentGates.length}/${equipmentModelIds.length}`);
    snapshot.evidence = { requirementIds, catalogGateIds: frozenCatalogGates.map((item) => item.id), openInterfaceIds: openInterfaces.map((item) => item.id), bomItemCount: projectBom.length, equipmentModelIds, equipmentGateIds: frozenEquipmentGates.map((item) => item.id) };
  }
  return snapshot;
}

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "approvals:read");
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
    if (!projectId) throw new ApiError(400, "项目不能为空", "INVALID_INPUT");
    assertProjectAccess(principal, projectId);
    const rows = await getDb().select().from(releaseGates).where(eq(releaseGates.projectId, projectId)).orderBy(desc(releaseGates.createdAt));
    return Response.json({ gates: rows.map((row) => ({ ...row, validationSnapshot: JSON.parse(row.validationSnapshotJson) })) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "approvals:create");
    assertAuthenticated(principal);
    const body = await request.json() as { projectId?: string; gateType?: GateType; entityType?: string; entityId?: string; revision?: string; title?: string };
    const projectId = body.projectId?.trim() ?? ""; const entityId = body.entityId?.trim() ?? ""; const gateType = body.gateType;
    if (!projectId || !entityId || !gateType || !workflow[gateType]) throw new ApiError(400, "项目、关口类型和对象不能为空", "INVALID_INPUT");
    assertProjectAccess(principal, projectId, true);
    const revision = body.revision?.trim() || "A";
    const snapshot = await validateGate(projectId, gateType, entityId);
    if (snapshot.blockers.length) throw new ApiError(409, snapshot.blockers.join("；"), "RELEASE_GATE_BLOCKED");
    const db = getDb();
    const [existing] = await db.select().from(releaseGates).where(and(eq(releaseGates.projectId, projectId), eq(releaseGates.gateType, gateType), eq(releaseGates.entityType, body.entityType || "unknown"), eq(releaseGates.entityId, entityId), eq(releaseGates.revision, revision))).limit(1);
    if (existing && ["pending", "frozen"].includes(existing.status)) throw new ApiError(409, `Rev.${revision} 已有${existing.status === "frozen" ? "冻结" : "待审批"}记录`, "RELEASE_GATE_EXISTS");
    const approvalId = crypto.randomUUID(); const gateId = existing?.id ?? crypto.randomUUID(); const now = new Date().toISOString();
    const flow = workflow[gateType];
    await db.insert(approvalRequests).values({ id: approvalId, projectId, workflowType: `release_gate:${gateType}`, entityType: "release_gate", entityId: gateId, title: body.title?.trim() || flow.title, status: "pending", currentStep: 1, stepsJson: JSON.stringify(flow.steps), requestedBy: principal.email });
    const gateValues = { projectId, gateType, entityType: body.entityType || "unknown", entityId, revision, approvalRequestId: approvalId, validationSnapshotJson: JSON.stringify(snapshot), status: "pending", submittedBy: principal.email, frozenBy: null, frozenAt: null, updatedAt: now };
    if (existing) await db.update(releaseGates).set(gateValues).where(eq(releaseGates.id, existing.id));
    else await db.insert(releaseGates).values({ id: gateId, ...gateValues });
    await writeAudit(request, principal, { projectId, action: "release_gate.submit", entityType: "releaseGates", entityId: gateId, after: { ...gateValues, blockers: snapshot.blockers, warnings: snapshot.warnings } });
    return Response.json({ gate: { id: gateId, ...gateValues, validationSnapshot: snapshot }, approval: { id: approvalId, steps: flow.steps } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}