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
  | "roles:manage";

export type Principal = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
};

const permissionMap: Record<string, Permission[] | ["*"]> = {
  platform_admin: ["*"],
  project_manager: ["data:read", "data:write", "equipment:read", "equipment:validate", "files:read", "files:write", "approvals:read", "approvals:create", "approvals:act"],
  system_owner: ["data:read", "data:write", "equipment:read", "equipment:validate", "files:read", "files:write", "approvals:read", "approvals:create", "approvals:act"],
  equipment_engineer: ["data:read", "data:write", "equipment:read", "equipment:validate", "files:read", "files:write", "approvals:read", "approvals:create"],
  reviewer: ["data:read", "equipment:read", "files:read", "approvals:read", "approvals:act"],
  viewer: ["data:read", "equipment:read", "files:read", "approvals:read"],
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
  throw new ApiError(401, "需要工作区身份才能访问此接口", "AUTH_REQUIRED");
}

export async function getPrincipal(request: Request): Promise<Principal> {
  const identity = identityFromRequest(request);
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
    const role = Number(total) === 0 ? "platform_admin" : "viewer";
    await db.insert(userRoles).values({
      id: crypto.randomUUID(), userId: user.id, role, scopeType: "global", scopeId: "*", grantedBy: "system-bootstrap",
    });
    roles = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
  }
  return { id: user.id, email: user.email, displayName: user.displayName, roles: roles.map((row) => row.role) };
}

export async function authorize(request: Request, permission: Permission) {
  const principal = await getPrincipal(request);
  const allowed = principal.roles.some((role) => permissionMap[role]?.includes("*") || permissionMap[role]?.includes(permission));
  if (!allowed) throw new ApiError(403, `当前角色无权执行 ${permission}`, "FORBIDDEN");
  return principal;
}
