import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { equipmentComponents, equipmentModels, equipmentPorts, materialApprovalRules, materialCompatibility, materials, selectionResults, selectionRuns, technicalMaterialRules } from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { validateSelection, type SelectionInput } from "@/lib/selection-engine";
import { findTechnicalRule } from "@/lib/material-rules";

type Payload = SelectionInput & { projectId?: string; equipmentModelId?: string; componentId?: string; portId?: string };

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "equipment:validate");
    assertAuthenticated(principal);
    const payload = await request.json() as Payload;
    const projectId = payload.projectId ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId, true);
    const required = ["equipmentModelId", "componentId", "selectedMaterialCode", "connectionStandard", "nominalSize", "medium"] as const;
    for (const key of required) if (!payload[key]) throw new ApiError(400, `${key} is required`, "INVALID_INPUT");
    if (!Number.isFinite(payload.operatingPressureMpa) || !Number.isFinite(payload.operatingTemperatureC)) throw new ApiError(400, "压力和温度必须是有效数值", "INVALID_INPUT");

    const db = getDb();
    const [model] = await db.select().from(equipmentModels).where(eq(equipmentModels.id, payload.equipmentModelId!)).limit(1);
    const [component] = await db.select().from(equipmentComponents).where(and(eq(equipmentComponents.id, payload.componentId!), eq(equipmentComponents.equipmentModelId, payload.equipmentModelId!))).limit(1);
    const [material] = await db.select().from(materials).where(eq(materials.code, payload.selectedMaterialCode)).limit(1);
    if (!model || !component || !material) throw new ApiError(404, "设备、内部部件或材料不存在", "NOT_FOUND");
    const [compatibility] = await db.select().from(materialCompatibility).where(and(eq(materialCompatibility.medium, payload.medium), eq(materialCompatibility.materialGrade, material.grade))).limit(1);
    const [port] = payload.portId ? await db.select().from(equipmentPorts).where(and(eq(equipmentPorts.id, payload.portId), eq(equipmentPorts.equipmentModelId, model.id))).limit(1) : [undefined];
    const technicalRules = await db.select().from(technicalMaterialRules).where(eq(technicalMaterialRules.status, "active"));
    const technicalRule = findTechnicalRule(payload.medium, technicalRules);
    const [brandRule] = technicalRule?.approvalRuleCode
      ? await db.select().from(materialApprovalRules).where(and(eq(materialApprovalRules.ruleCode, technicalRule.approvalRuleCode), eq(materialApprovalRules.status, "approved"))).limit(1)
      : [undefined];

    const validation = validateSelection({ ...payload, technicalRule: technicalRule ?? undefined, brandRule: brandRule ?? null }, component, material, compatibility ?? null, port ?? null);
    const runId = crypto.randomUUID();
    try {
      await db.insert(selectionRuns).values({
        id: runId,
        projectId,
        equipmentModelId: model.id,
        componentId: component.id,
        status: validation.status,
        score: validation.score,
        submittedBy: principal.email,
        inputJson: JSON.stringify(payload),
      });
      const resultRows = validation.results.map((result) => ({ id: crypto.randomUUID(), runId, ...result }));
      // D1 limits bound variables per statement. Ten rows stay below that limit
      // even when the engineering rule set grows additional result columns.
      for (let offset = 0; offset < resultRows.length; offset += 10) {
        await db.insert(selectionResults).values(resultRows.slice(offset, offset + 10));
      }
    } catch (error) {
      // Do not leave an orphan run when result persistence fails partway through.
      await db.delete(selectionResults).where(eq(selectionResults.runId, runId)).catch(() => undefined);
      await db.delete(selectionRuns).where(eq(selectionRuns.id, runId)).catch(() => undefined);
      throw error;
    }
    await writeAudit(request, principal, {
      projectId, action: "equipment.selection.validate", entityType: "selection_run", entityId: runId,
      after: { equipment: model.code, component: component.componentCode, material: material.code, status: validation.status, score: validation.score },
    });
    return Response.json({ runId, equipment: model, component, material, port: port ?? null, technicalRule, brandRule: brandRule ?? null, ...validation }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
