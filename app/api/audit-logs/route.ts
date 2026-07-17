import { and, desc, eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { errorResponse } from "@/lib/api";
import { assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "audit:read");
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId);
    const q = url.searchParams.get("q")?.trim();
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200) || 200));
    const conditions = [eq(auditLogs.projectId, projectId)];
    if (q) {
      const searchCondition = or(like(auditLogs.action, "%" + q + "%"), like(auditLogs.entityType, "%" + q + "%"), like(auditLogs.actorEmail, "%" + q + "%"));
      if (searchCondition) conditions.push(searchCondition);
    }
    const rows = await getDb().select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(limit);
    if (url.searchParams.get("format") === "csv") {
      const csv = ["createdAt,actorEmail,action,entityType,entityId", ...rows.map((row) => [row.createdAt, row.actorEmail, row.action, row.entityType, row.entityId].map((value) => JSON.stringify(value ?? "")).join(","))].join("\n");
      return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=audit-log.csv" } });
    }
    return Response.json({ logs: rows });
  } catch (error) { return errorResponse(error); }
}
