import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalRequests } from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { authorize } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export async function GET(request: Request) {
  try {
    await authorize(request, "approvals:read");
    const projectId = new URL(request.url).searchParams.get("projectId") ?? "proj-fab2a";
    const rows = await getDb().select().from(approvalRequests).where(eq(approvalRequests.projectId, projectId)).orderBy(desc(approvalRequests.createdAt)).limit(100);
    return Response.json({ approvals: rows });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; id?: string; projectId?: string; workflowType?: string; entityType?: string; entityId?: string; title?: string; steps?: string[]; note?: string };
    const db = getDb();
    if (body.action === "approve" || body.action === "reject") {
      const principal = await authorize(request, "approvals:act");
      if (!body.id) throw new ApiError(400, "审批 ID 缺失", "INVALID_INPUT");
      const [before] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, body.id)).limit(1);
      if (!before) throw new ApiError(404, "审批不存在", "NOT_FOUND");
      if (before.status !== "pending") throw new ApiError(409, "审批已处理", "ALREADY_DECIDED");
      const status = body.action === "approve" ? "approved" : "rejected";
      await db.update(approvalRequests).set({ status, decidedBy: principal.email, decisionNote: body.note ?? "", decidedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(approvalRequests.id, body.id));
      await writeAudit(request, principal, { projectId: before.projectId, action: `approval.${status}`, entityType: before.entityType, entityId: before.entityId, before, after: { status, note: body.note } });
      return Response.json({ id: body.id, status });
    }
    const principal = await authorize(request, "approvals:create");
    if (!body.workflowType || !body.entityType || !body.entityId || !body.title) throw new ApiError(400, "审批对象和流程类型不能为空", "INVALID_INPUT");
    const row = { id: crypto.randomUUID(), projectId: body.projectId ?? "proj-fab2a", workflowType: body.workflowType, entityType: body.entityType, entityId: body.entityId, title: body.title, status: "pending", currentStep: 1, stepsJson: JSON.stringify(body.steps?.length ? body.steps : ["系统负责人", "项目经理"]), requestedBy: principal.email };
    await db.insert(approvalRequests).values(row);
    await writeAudit(request, principal, { projectId: row.projectId, action: "approval.create", entityType: row.entityType, entityId: row.entityId, after: row });
    return Response.json({ approval: row }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
