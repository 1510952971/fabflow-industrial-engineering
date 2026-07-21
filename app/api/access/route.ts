import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { authCredentials, authSessions, userRoles, users } from "@/db/schema";
import { createPasswordCredential, validatePassword } from "@/lib/account-auth";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const allowedRoles = ["platform_admin", "project_manager", "system_owner", "equipment_engineer", "reviewer", "viewer"] as const;
type ManagedRole = typeof allowedRoles[number];

function requireRole(role: unknown): ManagedRole {
  if (!allowedRoles.includes(role as ManagedRole)) throw new ApiError(400, "角色不在允许列表中", "INVALID_ROLE");
  return role as ManagedRole;
}

function requireEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "请输入有效邮箱", "INVALID_EMAIL");
  return email;
}

async function activeAdminIds() {
  const rows = await getDb().select({ userId: users.id })
    .from(users).innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.status, "active"), eq(userRoles.role, "platform_admin")));
  return new Set(rows.map((row) => row.userId));
}

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "roles:manage");
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (projectId) assertProjectAccess(principal, projectId);
    const rows = await getDb().select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      userStatus: users.status,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
      hasPassword: authCredentials.userId,
      roleId: userRoles.id,
      role: userRoles.role,
      scopeType: userRoles.scopeType,
      scopeId: userRoles.scopeId,
    }).from(users)
      .leftJoin(authCredentials, eq(authCredentials.userId, users.id))
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .where(ne(users.status, "deleted"))
      .limit(500);
    return Response.json({ users: rows, roles: allowedRoles, currentUserId: principal.id });
  } catch (error) { return errorResponse(error); }
}

type AccessBody = {
  action?: "create_user" | "reset_password" | "set_status" | "delete_user" | "grant" | "revoke";
  userId?: string;
  email?: string;
  displayName?: string;
  password?: string;
  status?: "active" | "disabled";
  role?: string;
  scopeType?: string;
  scopeId?: string;
};

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "roles:manage");
    assertAuthenticated(principal);
    const body = await request.json() as AccessBody;
    if (!body.action) throw new ApiError(400, "管理动作必填", "INVALID_INPUT");
    const db = getDb();

    if (body.action === "create_user") {
      const email = requireEmail(body.email);
      const displayName = String(body.displayName ?? "").trim();
      if (displayName.length < 2) throw new ApiError(400, "用户姓名至少需要 2 个字符", "INVALID_DISPLAY_NAME");
      const password = String(body.password ?? "");
      const passwordError = validatePassword(password);
      if (passwordError) throw new ApiError(400, passwordError, "WEAK_PASSWORD");
      const role = requireRole(body.role ?? "viewer");
      const scopeType = role === "platform_admin" ? "global" : (body.scopeType === "global" ? "global" : "project");
      const scopeId = scopeType === "global" ? "*" : String(body.scopeId ?? "");
      if (scopeType === "project") {
        if (!scopeId) throw new ApiError(400, "项目级角色必须选择项目", "PROJECT_REQUIRED");
        assertProjectAccess(principal, scopeId, true);
      }
      if ((await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)).length) {
        throw new ApiError(409, "该邮箱已存在", "EMAIL_EXISTS");
      }
      const userId = crypto.randomUUID();
      const credential = await createPasswordCredential(password);
      await db.insert(users).values({ id: userId, email, displayName, status: "active", lastSeenAt: new Date().toISOString() });
      await db.insert(authCredentials).values({ userId, ...credential, passwordChangedAt: new Date().toISOString() });
      await db.insert(userRoles).values({ id: crypto.randomUUID(), userId, role, scopeType, scopeId, grantedBy: principal.email });
      await writeAudit(request, principal, { projectId: scopeType === "project" ? scopeId : null, action: "account.create", entityType: "user", entityId: userId, after: { email, displayName, role, scopeType, scopeId } });
      return Response.json({ userId, action: body.action }, { status: 201 });
    }

    if (!body.userId) throw new ApiError(400, "用户 ID 必填", "INVALID_INPUT");
    const [user] = await db.select().from(users).where(eq(users.id, body.userId)).limit(1);
    if (!user) throw new ApiError(404, "用户不存在", "NOT_FOUND");

    if (body.action === "delete_user") {
      if (user.id === principal.id) throw new ApiError(409, "\u4e0d\u80fd\u5220\u9664\u5f53\u524d\u767b\u5f55\u8d26\u53f7", "SELF_LOCKOUT_BLOCKED");
      const admins = await activeAdminIds();
      if (admins.has(user.id) && admins.size <= 1) throw new ApiError(409, "\u4e0d\u80fd\u5220\u9664\u6700\u540e\u4e00\u4e2a\u6709\u6548\u7ba1\u7406\u5458", "LAST_ADMIN_BLOCKED");
      const roles = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
      const now = new Date().toISOString();
      await db.update(authSessions).set({ status: "revoked" }).where(eq(authSessions.userId, user.id));
      await db.delete(authCredentials).where(eq(authCredentials.userId, user.id));
      await db.delete(userRoles).where(eq(userRoles.userId, user.id));
      await db.update(users).set({ status: "deleted", updatedAt: now }).where(eq(users.id, user.id));
      await writeAudit(request, principal, { action: "account.delete", entityType: "user", entityId: user.id, before: { email: user.email, status: user.status, roles }, after: { email: user.email, status: "deleted", roles: [] } });
      return Response.json({ userId: user.id, action: body.action, status: "deleted" });
    }

    if (user.status === "deleted") throw new ApiError(409, "\u5df2\u5220\u9664\u8d26\u53f7\u4e0d\u80fd\u7ee7\u7eed\u4fee\u6539\uff1b\u5386\u53f2\u8bb0\u5f55\u4ec5\u4f9b\u5ba1\u8ba1", "ACCOUNT_DELETED");

    if (body.action === "reset_password") {
      const password = String(body.password ?? "");
      const passwordError = validatePassword(password);
      if (passwordError) throw new ApiError(400, passwordError, "WEAK_PASSWORD");
      const credential = await createPasswordCredential(password);
      const now = new Date().toISOString();
      await db.insert(authCredentials).values({ userId: user.id, ...credential, passwordChangedAt: now })
        .onConflictDoUpdate({ target: authCredentials.userId, set: { ...credential, failedAttempts: 0, lockedUntil: null, passwordChangedAt: now, updatedAt: now } });
      await db.update(authSessions).set({ status: "revoked" }).where(eq(authSessions.userId, user.id));
      await writeAudit(request, principal, { action: "account.reset_password", entityType: "user", entityId: user.id });
      return Response.json({ userId: user.id, action: body.action });
    }

    if (body.action === "set_status") {
      if (body.status !== "active" && body.status !== "disabled") throw new ApiError(400, "账号状态无效", "INVALID_STATUS");
      if (user.id === principal.id && body.status === "disabled") throw new ApiError(409, "不能停用当前登录账号", "SELF_LOCKOUT_BLOCKED");
      const admins = await activeAdminIds();
      if (body.status === "disabled" && admins.has(user.id) && admins.size <= 1) throw new ApiError(409, "不能停用最后一个有效管理员", "LAST_ADMIN_BLOCKED");
      await db.update(users).set({ status: body.status, updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
      if (body.status === "disabled") await db.update(authSessions).set({ status: "revoked" }).where(eq(authSessions.userId, user.id));
      await writeAudit(request, principal, { action: `account.${body.status}`, entityType: "user", entityId: user.id, before: { status: user.status }, after: { status: body.status } });
      return Response.json({ userId: user.id, action: body.action, status: body.status });
    }

    const role = requireRole(body.role);
    const scopeType = role === "platform_admin" ? "global" : (body.scopeType === "global" ? "global" : "project");
    const scopeId = scopeType === "global" ? "*" : String(body.scopeId ?? "");
    if (scopeType === "project") {
      if (!scopeId) throw new ApiError(400, "项目级角色必须选择项目", "PROJECT_REQUIRED");
      assertProjectAccess(principal, scopeId, true);
    }
    const existing = await db.select().from(userRoles).where(and(eq(userRoles.userId, user.id), eq(userRoles.role, role), eq(userRoles.scopeType, scopeType), eq(userRoles.scopeId, scopeId))).limit(1);
    if (body.action === "grant") {
      if (!existing.length) await db.insert(userRoles).values({ id: crypto.randomUUID(), userId: user.id, role, scopeType, scopeId, grantedBy: principal.email });
    } else if (body.action === "revoke") {
      if (user.id === principal.id && role === "platform_admin") throw new ApiError(409, "不能移除当前账号的管理员角色", "SELF_LOCKOUT_BLOCKED");
      const admins = await activeAdminIds();
      if (role === "platform_admin" && admins.has(user.id) && admins.size <= 1) throw new ApiError(409, "不能移除最后一个有效管理员", "LAST_ADMIN_BLOCKED");
      if (existing.length) await db.delete(userRoles).where(inArray(userRoles.id, existing.map((row) => row.id)));
    } else {
      throw new ApiError(400, "不支持的管理动作", "INVALID_ACTION");
    }
    await writeAudit(request, principal, { projectId: scopeType === "project" ? scopeId : null, action: `role.${body.action}`, entityType: "user", entityId: user.id, after: { role, scopeType, scopeId } });
    return Response.json({ userId: user.id, action: body.action, role, scopeType, scopeId });
  } catch (error) { return errorResponse(error); }
}
