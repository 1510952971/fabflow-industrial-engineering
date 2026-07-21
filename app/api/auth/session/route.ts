import { env } from "cloudflare:workers";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authCredentials, authSessions } from "@/db/schema";
import { clearSessionCookie, createPasswordCredential, readSessionToken, requestUsesHttps, validatePassword, verifyPassword } from "@/lib/account-auth";
import { ApiError, errorResponse } from "@/lib/api";
import { getPrincipal, hasPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

function isLocalRequest(request: Request) {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export async function GET(request: Request) {
  try {
    const principal = await getPrincipal(request);
    const [{ total }] = await getDb().select({ total: count() }).from(authCredentials);
    const bootstrapRequired = Number(total) === 0;
    return Response.json({
      principal,
      bootstrapRequired,
      bootstrapEnabled: bootstrapRequired && (isLocalRequest(request) || Boolean(env.AUTH_BOOTSTRAP_TOKEN)),
      permissions: { canWrite: hasPermission(principal, "data:write"), canManageRoles: hasPermission(principal, "roles:manage") },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await getPrincipal(request);
    if (!principal.authenticated) throw new ApiError(401, "\u8bf7\u5148\u767b\u5f55\u8d26\u53f7", "AUTH_REQUIRED");
    const body = await request.json() as { action?: string; currentPassword?: string; newPassword?: string };
    if (body.action !== "change_password") throw new ApiError(400, "\u4e0d\u652f\u6301\u7684\u8d26\u53f7\u5b89\u5168\u52a8\u4f5c", "INVALID_ACTION");
    const newPassword = String(body.newPassword ?? "");
    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new ApiError(400, passwordError, "WEAK_PASSWORD");
    const db = getDb();
    const [credential] = await db.select().from(authCredentials).where(eq(authCredentials.userId, principal.id)).limit(1);
    if (!credential || !(await verifyPassword(String(body.currentPassword ?? ""), credential))) throw new ApiError(401, "\u5f53\u524d\u5bc6\u7801\u4e0d\u6b63\u786e", "INVALID_CURRENT_PASSWORD");
    if (await verifyPassword(newPassword, credential)) throw new ApiError(409, "\u65b0\u5bc6\u7801\u4e0d\u80fd\u4e0e\u5f53\u524d\u5bc6\u7801\u76f8\u540c", "PASSWORD_UNCHANGED");
    const next = await createPasswordCredential(newPassword); const now = new Date().toISOString();
    await db.update(authCredentials).set({ ...next, failedAttempts: 0, lockedUntil: null, passwordChangedAt: now, updatedAt: now }).where(eq(authCredentials.userId, principal.id));
    await db.update(authSessions).set({ status: "revoked" }).where(eq(authSessions.userId, principal.id));
    await writeAudit(request, principal, { action: "account.change_password", entityType: "user", entityId: principal.id });
    return Response.json({ ok: true, reauthenticate: true }, { headers: { "set-cookie": clearSessionCookie(requestUsesHttps(request)), "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const principal = await getPrincipal(request);
    if (principal.sessionId) {
      await getDb().update(authSessions).set({ status: "revoked" }).where(eq(authSessions.id, principal.sessionId));
      await writeAudit(request, principal, { action: "account.logout", entityType: "user", entityId: principal.id });
    } else if (readSessionToken(request)) {
      // An expired/invalid token is still cleared in the browser.
    }
    return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie(requestUsesHttps(request)), "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
