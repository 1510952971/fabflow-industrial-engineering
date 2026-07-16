import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { userRoles, users } from "@/db/schema";
import { ApiError } from "./api";

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
  | "roles:manage";

export type Principal = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  scopes: Array<{ type: string; id: string }>;
  authenticated: boolean;
};

export const PUBLIC_DEMO_PROJECT_ID = "proj-fab2a";

const permissionMap: Record<string, Permission[] | ["*"]> = {
  platform_admin: ["*"],
  project_manager: ["data:read", "data:write", "equipment:read", "equipment:validate", "files:read", "files:write", "approvals:read", "approvals:create", "approvals:act", "audit:read", "integrations:read", "integrations:manage"],
  system_owner: ["data:read", "data:write", "equipment:read", "equipment:validate", "files:read", "files:write", "approvals:read", "approvals:create", "approvals:act", "audit:read", "integrations:read"],
  equipment_engineer: ["data:read", "data:write", "equipment:read", "equipment:validate", "files:read", "files:write", "approvals:read", "approvals:create", "integrations:read"],
  reviewer: ["data:read", "equipment:read", "files:read", "approvals:read", "approvals:act", "audit:read", "integrations:read"],
  viewer: ["data:read", "equipment:read", "files:read", "approvals:read"],
  public_viewer: ["data:read", "equipment:read"],
};

function decodeName(request: Request) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  if (!encoded || request.headers.get("oai-authenticated-user-full-name-encoding") !== "percent-encoded-utf-8") return null;
  try { return decodeURIComponent(encoded); } catch { return null; }
}

function identityFromRequest(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (email) return { email, displayName: decodeName(request) ?? email };
  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return { email: "local.engineer@fabflow.dev", displayName: "本地工程师" };
  // The published site is intentionally readable as a sanitized demo. Writes
  // still require workspace identity and are rejected by the permission map.
  return null;
}

export async function getPrincipal(request: Request): Promise<Principal> {
  const identity = identityFromRequest(request);
  if (!identity) return { id: "public-demo", email: "public@fabflow.demo", displayName: "公开演示访客", roles: ["public_viewer"], scopes: [{ type: "project", id: PUBLIC_DEMO_PROJECT_ID }], authenticated: false };
  const db = getDb();
  await db.insert(users).values({
    id: crypto.randomUUID(),
    email: identity.email,
    displayName: identity.displayName,
    lastSeenAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: users.email,
    set: { displayName: identity.displayName, lastSeenAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  });

  const [user] = await db.select().from(users).where(eq(users.email, identity.email)).limit(1);
  if (!user) throw new ApiError(500, "用户身份初始化失败", "USER_INIT_FAILED");
  let roles = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
  if (roles.length === 0) {
    const [{ total }] = await db.select({ total: count() }).from(userRoles);
    const firstWorkspaceUser = Number(total) === 0;
    const role = firstWorkspaceUser ? "platform_admin" : "viewer";
    await db.insert(userRoles).values({
      id: crypto.randomUUID(), userId: user.id, role,
      scopeType: firstWorkspaceUser ? "global" : "project",
      scopeId: firstWorkspaceUser ? "*" : PUBLIC_DEMO_PROJECT_ID,
      grantedBy: "system-bootstrap",
    });
    roles = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: roles.map((row) => row.role),
    scopes: roles.map((row) => ({ type: row.scopeType, id: row.scopeId })),
    authenticated: true,
  };
}

export function hasPermission(principal: Principal, permission: Permission) {
  return principal.roles.some((role) => permissionMap[role]?.includes("*") || permissionMap[role]?.includes(permission));
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
  if (!principal.authenticated) throw new ApiError(401, "请先通过工作区身份登录后再执行写入操作", "AUTH_REQUIRED");
}

export async function authorize(request: Request, permission: Permission) {
  const principal = await getPrincipal(request);
  if (!hasPermission(principal, permission)) throw new ApiError(403, `当前角色无权执行 ${permission}`, "FORBIDDEN");
  return principal;
}
