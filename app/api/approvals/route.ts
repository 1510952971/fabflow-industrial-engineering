import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalRequests, releaseGates } from "@/db/schema";
import { approvalStepDecisions } from "@/db/workflow-schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID, type Principal } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const approvalRoles: Array<[RegExp, string]> = [
  [/设备工程师/, "equipment_engineer"],
  [/系统负责人/, "system_owner"],
  [/QA|QC|审查/, "reviewer"],
  [/项目经理/, "project_manager"],
];

function requiredRole(stepName: string) {
  return approvalRoles.find(([pattern]) => pattern.test(stepName))?.[1];
}

function assertStepActor(principal: Principal, stepName: string, requestedBy: string) {
  if (principal.roles.includes("platform_admin")) return;
  if (requestedBy === principal.email) throw new ApiError(409, "申请人不能审批自己的申请", "SELF_APPROVAL_FORBIDDEN");
  const role = requiredRole(stepName);
  if (!role || !principal.roles.includes(role)) throw new ApiError(403, `当前步骤“${stepName}”要求 ${role ?? "已配置审批角色"}`, "APPROVAL_STEP_FORBIDDEN");
}

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "approvals:read");
    const projectId = new URL(request.url).searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId);
    const db = getDb();
    const rows = await db.select().from(approvalRequests).where(eq(approvalRequests.projectId, projectId)).orderBy(desc(approvalRequests.createdAt)).limit(100);
    const decisions = await db.select().from(approvalStepDecisions).limit(500);
    return Response.json({ approvals: rows, decisions: decisions.filter((decision) => rows.some((row) => row.id === decision.requestId)) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; id?: string; projectId?: string; workflowType?: string; entityType?: string; entityId?: string; title?: string; steps?: string[]; note?: string };
    const db = getDb();
    if (body.action === "approve" || body.action === "reject") {
      const principal = await authorize(request, "approvals:act");
      assertAuthenticated(principal);
      if (!body.id) throw new ApiError(400, "审批 ID 缺失", "INVALID_INPUT");
      const [before] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, body.id)).limit(1);
      if (!before) throw new ApiError(404, "审批不存在", "NOT_FOUND");
      assertProjectAccess(principal, before.projectId, true);
      if (before.status !== "pending") throw new ApiError(409, "审批已处理", "ALREADY_DECIDED");
      const steps = JSON.parse(before.stepsJson) as string[];
      const stepIndex = Math.max(1, before.currentStep);
      const stepName = steps[stepIndex - 1] ?? ("步骤 " + stepIndex);
      assertStepActor(principal, stepName, before.requestedBy);
      await db.insert(approvalStepDecisions).values({ id: crypto.randomUUID(), requestId: before.id, stepIndex, stepName, action: body.action, actorEmail: principal.email, note: body.note ?? "" });
      const final = body.action === "reject" || stepIndex >= steps.length;
      const status = body.action === "reject" ? "rejected" : final ? "approved" : "pending";
      await db.update(approvalRequests).set({ status, currentStep: final ? stepIndex : stepIndex + 1, decidedBy: final ? principal.email : null, decisionNote: body.note ?? "", decidedAt: final ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }).where(eq(approvalRequests.id, body.id));
      if (final) await db.update(releaseGates).set({ status: status === "approved" ? "frozen" : "rejected", frozenBy: status === "approved" ? principal.email : null, frozenAt: status === "approved" ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }).where(eq(releaseGates.approvalRequestId, before.id));
      await writeAudit(request, principal, { projectId: before.projectId, action: "approval." + status, entityType: before.entityType, entityId: before.entityId, before, after: { status, stepIndex, stepName, note: body.note } });
      return Response.json({ id: body.id, status, currentStep: final ? stepIndex : stepIndex + 1, stepName: final ? null : steps[stepIndex] });
    }
    const principal = await authorize(request, "approvals:create");
    assertAuthenticated(principal);
    if (!body.workflowType || !body.entityType || !body.entityId || !body.title) throw new ApiError(400, "审批对象和流程类型不能为空", "INVALID_INPUT");
    const projectId = body.projectId ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId, true);
    const steps = body.steps?.length ? body.steps : ["系统负责人", "项目经理"];
    if (steps.length > 8 || steps.some((step) => !requiredRole(step))) throw new ApiError(400, "审批步骤必须使用已配置角色，且不能超过 8 步", "INVALID_APPROVAL_CHAIN");
    const row = { id: crypto.randomUUID(), projectId, workflowType: body.workflowType, entityType: body.entityType, entityId: body.entityId, title: body.title, status: "pending", currentStep: 1, stepsJson: JSON.stringify(steps), requestedBy: principal.email };
    await db.insert(approvalRequests).values(row);
    await writeAudit(request, principal, { projectId: row.projectId, action: "approval.create", entityType: row.entityType, entityId: row.entityId, after: row });
    return Response.json({ approval: row }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
