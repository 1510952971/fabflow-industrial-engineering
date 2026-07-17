import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projectConfigurations, projects, systems, userRoles, users } from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { assertAuthenticated, authorize } from "@/lib/auth";
import { facilitySystems } from "@/lib/facility-systems";

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "data:write");
    assertAuthenticated(principal);
    if (!principal.roles.includes("platform_admin") && !principal.scopes.some((scope) => scope.type === "global" && scope.id === "*")) {
      throw new ApiError(403, "只有全局管理员可以创建新项目并初始化权限边界", "GLOBAL_SCOPE_REQUIRED");
    }
    const body = await request.json() as { code?: string; name?: string; region?: string; fab?: string; phase?: string; templateCode?: string; numberPrefix?: string; defaultWastePct?: number; systemCodes?: string[] };
    const code = body.code?.trim().toUpperCase() ?? "";
    const name = body.name?.trim() ?? "";
    if (!code || !name) throw new ApiError(400, "项目编号和项目名称不能为空", "INVALID_INPUT");
    const selectedSystems = facilitySystems.filter((item) => !body.systemCodes?.length || body.systemCodes.includes(item.code));
    if (!selectedSystems.length) throw new ApiError(400, "至少选择一个项目系统", "SYSTEM_TEMPLATE_REQUIRED");
    const projectId = crypto.randomUUID();
    const row = { id: projectId, code, name, region: body.region?.trim() || "CN", fab: body.fab?.trim() || "FAB", phase: body.phase?.trim() || "concept", status: "active" };
    const db = getDb();
    await db.insert(projects).values(row);
    await db.insert(projectConfigurations).values({
      projectId,
      templateCode: body.templateCode?.trim() || "FAB_FULL",
      numberPrefix: body.numberPrefix?.trim().toUpperCase() || code,
      defaultWastePct: Number.isFinite(Number(body.defaultWastePct)) ? Math.min(30, Math.max(0, Number(body.defaultWastePct))) : 5,
      systemTemplateJson: JSON.stringify(selectedSystems.map((item) => item.code)),
      fileCategoriesJson: JSON.stringify(["technical_specification", "drawings", "calculations", "vendor_documents", "itp_fat", "site_records", "handover"]),
      workflowStatus: "initialized",
      createdBy: principal.email,
    });
    const [creator] = await db.select().from(users).where(eq(users.email, principal.email)).limit(1);
    if (creator) await db.insert(userRoles).values({ id: crypto.randomUUID(), userId: creator.id, role: "project_manager", scopeType: "project", scopeId: projectId, grantedBy: principal.email }).onConflictDoNothing();
    for (const item of selectedSystems) await db.insert(systems).values({
      id: crypto.randomUUID(), projectId, code: item.code, name: item.name, discipline: item.domainId, ownerEmail: null, designMaturity: 0, status: "design",
    });
    await writeAudit(request, principal, { projectId, action: "project.bootstrap", entityType: "projects", entityId: projectId, after: { ...row, templateCode: body.templateCode || "FAB_FULL", systems: selectedSystems.map((item) => item.code) } });
    return Response.json({ project: row, systems: selectedSystems.map((item) => ({ code: item.code, name: item.name })), directories: ["技术规格书", "图纸", "计算书", "设备厂资料", "ITP/FAT", "现场记录", "竣工移交"] }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}