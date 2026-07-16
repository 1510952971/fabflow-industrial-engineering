import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalRequests, attachments, auditLogs, bomItems, constructionWorkPackages, equipmentModels, integrationEvents, interfaces, managementOfChanges, materials, projects, punchItems, systems, tags, testPacks, workflowActions } from "@/db/schema";
import { assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";
import { errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "data:read");
    const projectId = new URL(request.url).searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId);
    const db = getDb();
    const [projectCount, systemCount, tagCount, interfaceCount, materialCount, bomCount, testPackCount, punchCount, equipmentCount, mocCount, cwpCount, workflowCount, attachmentCount, auditCount, approvalCount, eventCount] = await Promise.all([
      db.select({ value: count() }).from(projects).where(eq(projects.id, projectId)),
      db.select({ value: count() }).from(systems).where(eq(systems.projectId, projectId)),
      db.select({ value: count() }).from(tags).where(eq(tags.projectId, projectId)),
      db.select({ value: count() }).from(interfaces).where(eq(interfaces.projectId, projectId)),
      db.select({ value: count() }).from(materials),
      db.select({ value: count() }).from(bomItems).where(eq(bomItems.projectId, projectId)),
      db.select({ value: count() }).from(testPacks).where(eq(testPacks.projectId, projectId)),
      db.select({ value: count() }).from(punchItems).where(eq(punchItems.projectId, projectId)),
      db.select({ value: count() }).from(equipmentModels),
      db.select({ value: count() }).from(managementOfChanges).where(eq(managementOfChanges.projectId, projectId)),
      db.select({ value: count() }).from(constructionWorkPackages).where(eq(constructionWorkPackages.projectId, projectId)),
      db.select({ value: count() }).from(workflowActions).where(eq(workflowActions.projectId, projectId)),
      db.select({ value: count() }).from(attachments).where(eq(attachments.projectId, projectId)),
      db.select({ value: count() }).from(auditLogs).where(eq(auditLogs.projectId, projectId)),
      db.select({ value: count() }).from(approvalRequests).where(and(eq(approvalRequests.projectId, projectId), eq(approvalRequests.status, "pending"))),
      db.select({ value: count() }).from(integrationEvents).where(and(eq(integrationEvents.projectId, projectId), eq(integrationEvents.status, "queued"))),
    ]);
    const value = (rows: { value: number }[]) => Number(rows[0]?.value ?? 0);
    return Response.json({
      storage: { d1: "connected", r2: "connected" },
      principal,
      counts: {
        projects: value(projectCount), systems: value(systemCount), tags: value(tagCount), interfaces: value(interfaceCount),
        materials: value(materialCount), bomItems: value(bomCount), testPacks: value(testPackCount), punchItems: value(punchCount), equipmentModels: value(equipmentCount),
        managementOfChanges: value(mocCount), constructionWorkPackages: value(cwpCount), workflowActions: value(workflowCount),
        attachments: value(attachmentCount), auditLogs: value(auditCount), pendingApprovals: value(approvalCount), queuedEvents: value(eventCount),
      },
    });
  } catch (error) { return errorResponse(error); }
}
