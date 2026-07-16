import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { equipmentComponents, equipmentFactories, equipmentModels, equipmentPorts, materialApprovalRules, materials, technicalMaterialRules } from "@/db/schema";
import { authorize } from "@/lib/auth";
import { errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "equipment:read");
    const db = getDb();
    const models = await db.select({
      id: equipmentModels.id, code: equipmentModels.code, name: equipmentModels.name, category: equipmentModels.category,
      revision: equipmentModels.revision, designStandard: equipmentModels.designStandard, factoryId: equipmentFactories.id,
      factoryCode: equipmentFactories.code, factoryName: equipmentFactories.name, country: equipmentFactories.country,
      qualityStatus: equipmentFactories.qualityStatus,
    }).from(equipmentModels).innerJoin(equipmentFactories, eq(equipmentModels.factoryId, equipmentFactories.id));
    const componentRows = await db.select().from(equipmentComponents);
    const portRows = await db.select().from(equipmentPorts);
    const materialRows = await db.select().from(materials).where(eq(materials.status, "approved"));
    const technicalRules = await db.select().from(technicalMaterialRules).where(eq(technicalMaterialRules.status, "active"));
    const brandRules = await db.select().from(materialApprovalRules).where(eq(materialApprovalRules.status, "approved"));
    return Response.json({
      principal,
      models: models.map((model) => ({
        ...model,
        components: componentRows.filter((row) => row.equipmentModelId === model.id),
        ports: portRows.filter((row) => row.equipmentModelId === model.id),
      })),
      materials: materialRows,
      technicalRules,
      brandRules,
    });
  } catch (error) { return errorResponse(error); }
}
