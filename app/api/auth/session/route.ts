import { env } from "cloudflare:workers";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authCredentials, authSessions } from "@/db/schema";
import { clearSessionCookie, readSessionToken, requestUsesHttps } from "@/lib/account-auth";
import { errorResponse } from "@/lib/api";
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
