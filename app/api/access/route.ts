import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { userRoles, users } from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "roles:manage");
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (projectId) assertProjectAccess(principal, projectId);
    const rows = await getDb().select({ userId: users.id, email: users.email, displayName: users.displayName, userStatus: users.status, roleId: userRoles.id, role: userRoles.role, scopeType: userRoles.scopeType, scopeId: userRoles.scopeId }).from(users).leftJoin(userRoles, eq(userRoles.userId, users.id)).limit(500);
    return Response.json({ users: rows });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "roles:manage");
    assertAuthenticated(principal);
    const body = await request.json() as { action?: "grant" | "revoke"; userId?: string; email?: string; role?: string; scopeType?: string; scopeId?: string };
    if (!body.action || !body.role || (!body.userId && !body.email)) throw new ApiError(400, "用户、角色和动作必填", "INVALID_INPUT");
    const db = getDb();
    const [user] = body.userId ? await db.select().from(users).where(eq(users.id, body.userId)).limit(1) : await db.select().from(users).where(eq(users.email, String(body.email).toLowerCase())).limit(1);
    if (!user) throw new ApiError(404, "用户不存在", "NOT_FOUND");
    const scopeType = body.scopeType ?? "global";
    const scopeId = body.scopeId ?? "*";
    if (scopeType === "project") assertProjectAccess(principal, scopeId, true);
    const existing = await db.select().from(userRoles).where(and(eq(userRoles.userId, user.id), eq(userRoles.role, body.role), eq(userRoles.scopeType, scopeType), eq(userRoles.scopeId, scopeId))).limit(1);
    if (body.action === "grant" && !existing.length) await db.insert(userRoles).values({ id: crypto.randomUUID(), userId: user.id, role: body.role, scopeType, scopeId, grantedBy: principal.email });
    if (body.action === "revoke" && existing[0]) await db.delete(userRoles).where(eq(userRoles.id, existing[0].id));
    return Response.json({ userId: user.id, action: body.action, role: body.role, scopeType, scopeId });
  } catch (error) { return errorResponse(error); }
}
