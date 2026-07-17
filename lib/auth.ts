import { and, count, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { authSessions, userRoles, users } from "@/db/schema";
import { ApiError } from "./api";
import { hashToken, readSessionToken } from "./account-auth";

export type Permission =
  | "data:read"
  | "data:write"
  | "equipment:read"
  | "equipment:validate"
  | "files:read"
  | "files:write"
  | "approvals:read"
  | "approvals:create"
  | "approvals:act"
  | "audit:read"
  | "integrations:read"
  | "integrations:manage"
  | "signatures:read"
  | "signatures:create"
  | "signatures:manage"
  | "roles:manage";

export type Principal = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  scopes: Array<{ type: string; id: string }>;
  authenticated: boolean;
  sessionId?: string;
};

export const PUBLIC_DEMO_PROJECT_ID = "proj-fab2a";

const permissionMap: Record<string, Permission[] | ["*"]> = {
  platform_admin: ["*"],
  project_manager: ["data:read", "data:write", "equipment:read", "equipment:validate", "files:read", "files:write", "approvals:read", "approvals:create", "approvals:act", "audit:read", "integrations:read", "integrations:manage", "signatures:read", "signatures:create", "signatures:manage"],
  system_owner: ["data:read", "data:write", "equipment:read", "equipment:validate", "files:read", "files:write", "approvals:read", "approvals:create", "approvals:act", "audit:read", "integrations:read", "signatures:read", "signatures:create"],
  equipment_engineer: ["data:read", "data:write", "equipment:read", "equipment:validate", "files:read", "files:write", "approvals:read", "approvals:create", "integrations:read", "signatures:read", "signatures:create"],
  reviewer: ["data:read", "equipment:read", "files:read", "approvals:read", "approvals:act", "audit:read", "integrations:read", "signatures:read"],
  viewer: ["data:read", "equipment:read", "files:read", "approvals:read", "signatures:read"],
  public_viewer: ["data:read", "equipment:read"],
};

function decodeName(request: Request) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  if (!encoded || request.headers.get("oai-authenticated-user-full-name-encoding") !== "percent-encoded-utf-8") return null;
  try { return decodeURIComponent(encoded); } catch { return null; }
}

function workspaceIdentity(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  return email ? { email, displayName: decodeName(request) ?? email } : null;
}

async function principalForUser(user: typeof users.$inferSelect, sessionId?: string): Promise<Principal> {
  const roles = await getDb().select().from(userRoles).where(eq(userRoles.userId, user.id));
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: roles.map((row) => row.role),
    scopes: roles.map((row) => ({ type: row.scopeType, id: row.scopeId })),
    authenticated: true,
    sessionId,
  };
}

async function sessionPrincipal(request: Request) {
  const token = readSessionToken(request);
  if (!token) return null;
  const now = new Date().toISOString();
  const tokenHash = await hashToken(token);
  const [row] = await getDb().select({ session: authSessions, user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, tokenHash), eq(authSessions.status, "active"), gt(authSessions.expiresAt, now), eq(users.status, "active")))
    .limit(1);
  if (!row) return null;
  if (Date.now() - new Date(row.session.lastSeenAt).getTime() > 5 * 60 * 1000) {
    await Promise.all([
      getDb().update(authSessions).set({ lastSeenAt: now }).where(eq(authSessions.id, row.session.id)),
      getDb().update(users).set({ lastSeenAt: now, updatedAt: now }).where(eq(users.id, row.user.id)),
    ]);
  }
  return principalForUser(row.user, row.session.id);
}

async function workspacePrincipal(request: Request) {
  const identity = workspaceIdentity(request);
  if (!identity) return null;
  const db = getDb();
  const now = new Date().toISOString();
  await db.insert(users).values({ id: crypto.randomUUID(), email: identity.email, displayName: identity.displayName, lastSeenAt: now })
    .onConflictDoUpdate({ target: users.email, set: { displayName: identity.displayName, lastSeenAt: now, updatedAt: now } });
  const [user] = await db.select().from(users).where(eq(users.email, identity.email)).limit(1);
  if (!user || user.status !== "active") throw new ApiError(403, "账号已停用", "ACCOUNT_DISABLED");
  let roles = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
  if (roles.length === 0) {
    const [{ total }] = await db.select({ total: count() }).from(userRoles);
    const firstWorkspaceUser = Number(total) === 0;
    const role = firstWorkspaceUser ? "platform_admin" : "viewer";
    await db.insert(userRoles).values({
      id: crypto.randomUUID(), userId: user.id, role,
      scopeType: firstWorkspaceUser ? "global" : "project",
      scopeId: firstWorkspaceUser ? "*" : PUBLIC_DEMO_PROJECT_ID,
      grantedBy: "workspace-bootstrap",
    });
    roles = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
  }
  return {
    id: user.id, email: user.email, displayName: user.displayName,
    roles: roles.map((row) => row.role),
    scopes: roles.map((row) => ({ type: row.scopeType, id: row.scopeId })),
    authenticated: true,
  } satisfies Principal;
}

export async function getPrincipal(request: Request): Promise<Principal> {
  const session = await sessionPrincipal(request);
  if (session) return session;
  const workspace = await workspacePrincipal(request);
  if (workspace) return workspace;
  return {
    id: "public-demo", email: "public@fabflow.demo", displayName: "公开演示访客",
    roles: ["public_viewer"], scopes: [{ type: "project", id: PUBLIC_DEMO_PROJECT_ID }], authenticated: false,
  };
}

export function hasPermission(principal: Principal, permission: Permission) {
  return principal.roles.some((role) => {
    const allowed = permissionMap[role] as readonly string[] | undefined;
    return allowed?.includes("*") || allowed?.includes(permission);
  });
}

export function canAccessProject(principal: Principal, projectId: string | null | undefined) {
  if (!projectId) return true;
  if (principal.roles.includes("platform_admin")) return true;
  return principal.scopes.some((scope) => scope.id === "*" || (scope.type === "project" && scope.id === projectId));
}

export function assertProjectAccess(principal: Principal, projectId: string | null | undefined, write = false) {
  if (!projectId || canAccessProject(principal, projectId)) return;
  throw new ApiError(write ? 403 : 404, write ? "当前账号没有此项目的写入范围" : "当前账号没有此项目的访问范围", write ? "PROJECT_SCOPE_FORBIDDEN" : "PROJECT_NOT_FOUND");
}

export function assertAuthenticated(principal: Principal) {
  if (!principal.authenticated) throw new ApiError(401, "请先登录账号后再执行写入操作", "AUTH_REQUIRED");
}

export async function authorize(request: Request, permission: Permission) {
  const principal = await getPrincipal(request);
  if (!hasPermission(principal, permission)) throw new ApiError(403, `当前角色无权执行 ${permission}`, "FORBIDDEN");
  return principal;
}
