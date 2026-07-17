import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bomItems, equipmentComponents, equipmentMaterialSelections, equipmentModels, equipmentPorts,
  materialApprovalRules, materialCompatibility, materials, selectionResults, selectionRuns, technicalMaterialRules,
} from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { assertAuthenticated, assertProjectAccess, authorize } from "@/lib/auth";
import { findTechnicalRule } from "@/lib/material-rules";
import { validateSelection } from "@/lib/selection-engine";

type SelectionChoice = { componentId: string; materialCode: string };
type Payload = { action?: "validate" | "generate_bom"; projectId?: string; equipmentModelId?: string; selections?: SelectionChoice[] };

function parseAllowed(value: string) { try { return JSON.parse(value) as string[]; } catch { return []; } }

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "equipment:validate");
    assertAuthenticated(principal);
    const payload = await request.json() as Payload;
    const projectId = payload.projectId?.trim() ?? "";
    const equipmentModelId = payload.equipmentModelId?.trim() ?? "";
    if (!projectId || !equipmentModelId) throw new ApiError(400, "项目和设备型号不能为空", "INVALID_INPUT");
    assertProjectAccess(principal, projectId, true);
    const db = getDb();
    const [model] = await db.select().from(equipmentModels).where(eq(equipmentModels.id, equipmentModelId)).limit(1);
    if (!model) throw new ApiError(404, "设备型号不存在", "NOT_FOUND");
    const components = await db.select().from(equipmentComponents).where(eq(equipmentComponents.equipmentModelId, model.id));
    if (!components.length) throw new ApiError(409, "设备型号尚未录入内部部件", "EQUIPMENT_BOM_REQUIRED");

    if (payload.action === "generate_bom") {
      const selections = await db.select().from(equipmentMaterialSelections).where(and(eq(equipmentMaterialSelections.projectId, projectId), eq(equipmentMaterialSelections.equipmentModelId, model.id)));
      if (selections.length !== components.length) throw new ApiError(409, `整机配材未完成：应有 ${components.length} 项，当前 ${selections.length} 项`, "BATCH_SELECTION_INCOMPLETE");
      const blocked = selections.filter((item) => item.status === "blocked");
      if (blocked.length) throw new ApiError(409, `仍有 ${blocked.length} 项致命不符合，禁止生成设备 BOM`, "BATCH_SELECTION_BLOCKED");
      const materialRows = await db.select().from(materials).where(inArray(materials.id, selections.map((item) => item.materialId)));
      const materialMap = new Map(materialRows.map((item) => [item.id, item]));
      const componentMap = new Map(components.map((item) => [item.id, item]));
      const created: string[] = [];
      for (const selection of selections) {
        const component = componentMap.get(selection.componentId); const material = materialMap.get(selection.materialId);
        if (!component || !material) continue;
        const sourceId = `equipment:${model.id}:${component.id}`;
        const [existing] = await db.select().from(bomItems).where(and(eq(bomItems.projectId, projectId), eq(bomItems.sourceType, "equipment_internal_selection"), eq(bomItems.sourceId, sourceId))).limit(1);
        const values = { materialId: material.id, itemCode: `${model.code}-${component.componentCode}`, itemName: `${model.name} / ${component.componentName}`, specification: `${material.manufacturer} · ${material.code} · ${material.grade} · ${material.surfaceFinish} · ${component.connectionStandard} ${component.nominalSize}`, quantity: component.quantity, unit: "件", wastePct: 0, sourceType: "equipment_internal_selection", sourceId, status: "draft", updatedAt: new Date().toISOString() };
        if (existing) await db.update(bomItems).set(values).where(eq(bomItems.id, existing.id));
        else { const id = crypto.randomUUID(); await db.insert(bomItems).values({ id, projectId, ...values }); created.push(id); }
      }
      await writeAudit(request, principal, { projectId, action: "equipment.batch.generate_bom", entityType: "equipmentModels", entityId: model.id, after: { componentCount: components.length, createdCount: created.length } });
      return Response.json({ generated: components.length, created: created.length, model });
    }

    if (payload.action !== "validate") throw new ApiError(400, "不支持的整机动作", "INVALID_ACTION");
    const allMaterials = await db.select().from(materials).where(eq(materials.status, "approved"));
    const compatibilities = await db.select().from(materialCompatibility);
    const ports = await db.select().from(equipmentPorts).where(eq(equipmentPorts.equipmentModelId, model.id));
    const technicalRules = await db.select().from(technicalMaterialRules).where(eq(technicalMaterialRules.status, "active"));
    const brandRules = await db.select().from(materialApprovalRules).where(eq(materialApprovalRules.status, "approved"));
    const choices = new Map((payload.selections ?? []).map((item) => [item.componentId, item.materialCode]));
    const rows: Array<{ componentId: string; componentCode: string; componentName: string; materialCode: string; materialName: string; runId: string; status: string; score: number; fatalCount: number; warningCount: number }> = [];

    for (const component of components) {
      const allowed = parseAllowed(component.allowedMaterialsJson);
      const explicitCode = choices.get(component.id);
      const candidates = allMaterials.filter((material) => !explicitCode || material.code === explicitCode).filter((material) => allowed.includes(material.grade));
      const material = candidates.find((item) => item.surfaceFinish === component.requiredFinish && item.cleanlinessGrade === component.requiredCleanliness) ?? candidates[0];
      if (!material) throw new ApiError(409, `${component.componentCode} 没有可用批准材料，请先维护材料库或显式指定`, "APPROVED_MATERIAL_REQUIRED");
      const compatibility = compatibilities.find((item) => item.medium.toLowerCase() === component.medium.toLowerCase() && item.materialGrade === material.grade) ?? null;
      const port = ports.find((item) => item.service.toLowerCase() === component.medium.toLowerCase()) ?? ports.find((item) => item.connectionStandard === component.connectionStandard && item.nominalSize === component.nominalSize) ?? null;
      const technicalRule = findTechnicalRule(component.medium, technicalRules);
      const brandRule = technicalRule?.approvalRuleCode ? brandRules.find((item) => item.ruleCode === technicalRule.approvalRuleCode) ?? null : null;
      const input = { medium: component.medium, selectedMaterialCode: material.code, connectionStandard: component.connectionStandard, nominalSize: component.nominalSize, operatingPressureMpa: component.designPressureMpa, operatingTemperatureC: component.designTemperatureC, doubleContainment: technicalRule?.doubleContainment ? "double" as const : "single" as const, flexibleTube: "none" as const, technicalRule: technicalRule ?? undefined, brandRule };
      const validation = validateSelection(input, component, material, compatibility, port);
      const runId = crypto.randomUUID();
      await db.insert(selectionRuns).values({ id: runId, projectId, equipmentModelId: model.id, componentId: component.id, status: validation.status, score: validation.score, submittedBy: principal.email, inputJson: JSON.stringify(input) });
      await db.insert(selectionResults).values(validation.results.map((result) => ({ id: crypto.randomUUID(), runId, ...result })));
      const now = new Date().toISOString();
      await db.insert(equipmentMaterialSelections).values({ id: crypto.randomUUID(), projectId, equipmentModelId: model.id, componentId: component.id, materialId: material.id, runId, quantity: component.quantity, status: validation.status, score: validation.score, selectedBy: principal.email, selectedAt: now }).onConflictDoUpdate({ target: [equipmentMaterialSelections.projectId, equipmentMaterialSelections.componentId], set: { materialId: material.id, runId, quantity: component.quantity, status: validation.status, score: validation.score, selectedBy: principal.email, selectedAt: now, updatedAt: now } });
      rows.push({ componentId: component.id, componentCode: component.componentCode, componentName: component.componentName, materialCode: material.code, materialName: material.name, runId, status: validation.status, score: validation.score, fatalCount: validation.fatalCount, warningCount: validation.warningCount });
    }
    const summary = { total: rows.length, passed: rows.filter((item) => item.status === "passed").length, attention: rows.filter((item) => item.status === "attention").length, blocked: rows.filter((item) => item.status === "blocked").length, averageScore: Math.round(rows.reduce((sum, item) => sum + item.score, 0) / rows.length) };
    await writeAudit(request, principal, { projectId, action: "equipment.batch.validate", entityType: "equipmentModels", entityId: model.id, after: summary });
    return Response.json({ model, rows, summary }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}