import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalRequests, attachments, auditLogs, bomItems, equipmentModels, integrationEvents, interfaces, materials, projects, punchItems, systems, tags, testPacks } from "@/db/schema";
import { authorize } from "@/lib/auth";
import { errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "data:read");
    const db = getDb();
    const [projectCount, systemCount, tagCount, interfaceCount, materialCount, bomCount, testPackCount, punchCount, equipmentCount, attachmentCount, auditCount, approvalCount, eventCount] = await Promise.all([
      db.select({ value: count() }).from(projects),
      db.select({ value: count() }).from(systems),
      db.select({ value: count() }).from(tags),
      db.select({ value: count() }).from(interfaces),
      db.select({ value: count() }).from(materials),
      db.select({ value: count() }).from(bomItems),
      db.select({ value: count() }).from(testPacks),
      db.select({ value: count() }).from(punchItems),
      db.select({ value: count() }).from(equipmentModels),
      db.select({ value: count() }).from(attachments),
      db.select({ value: count() }).from(auditLogs),
      db.select({ value: count() }).from(approvalRequests).where(eq(approvalRequests.status, "pending")),
      db.select({ value: count() }).from(integrationEvents).where(eq(integrationEvents.status, "queued")),
    ]);
    const value = (rows: { value: number }[]) => Number(rows[0]?.value ?? 0);
    return Response.json({
      storage: { d1: "connected", r2: "connected" },
      principal,
      counts: {
        projects: value(projectCount), systems: value(systemCount), tags: value(tagCount), interfaces: value(interfaceCount),
        materials: value(materialCount), bomItems: value(bomCount), testPacks: value(testPackCount), punchItems: value(punchCount), equipmentModels: value(equipmentCount),
        attachments: value(attachmentCount), auditLogs: value(auditCount), pendingApprovals: value(approvalCount), queuedEvents: value(eventCount),
      },
    });
  } catch (error) { return errorResponse(error); }
}
