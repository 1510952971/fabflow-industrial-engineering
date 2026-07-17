import { env } from "cloudflare:workers";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authCredentials, authSessions, userRoles, users } from "@/db/schema";
import {
  createPasswordCredential,
  createSessionToken,
  hashToken,
  LOCK_SECONDS,
  MAX_FAILED_ATTEMPTS,
  requestIpHash,
  requestUsesHttps,
  sessionCookie,
  sessionExpiry,
  validatePassword,
  verifyPassword,
} from "@/lib/account-auth";
import { ApiError, errorResponse } from "@/lib/api";
import { getPrincipal } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

type LoginBody = {
  action?: "login" | "bootstrap";
  email?: string;
  password?: string;
  displayName?: string;
  bootstrapToken?: string;
};

function normalizedEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "请输入有效邮箱", "INVALID_EMAIL");
  return email;
}

function isLocalRequest(request: Request) {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1";
}

async function establishSession(request: Request, userId: string) {
  const token = createSessionToken();
  await getDb().insert(authSessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: await hashToken(token),
    expiresAt: sessionExpiry(),
    ipHash: await requestIpHash(request),
    userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
  });
  return token;
}

async function bootstrap(request: Request, body: LoginBody) {
  const db = getDb();
  const [{ total }] = await db.select({ total: count() }).from(authCredentials);
  if (Number(total) > 0) throw new ApiError(409, "系统已完成管理员初始化，请直接登录", "BOOTSTRAP_COMPLETE");
  const configuredToken = env.AUTH_BOOTSTRAP_TOKEN?.trim();
  if (!isLocalRequest(request) && (!configuredToken || body.bootstrapToken !== configuredToken)) {
    throw new ApiError(403, "管理员初始化口令无效", "BOOTSTRAP_TOKEN_INVALID");
  }
  const email = normalizedEmail(body.email);
  const password = String(body.password ?? "");
  const passwordError = validatePassword(password);
  if (passwordError) throw new ApiError(400, passwordError, "WEAK_PASSWORD");
  const displayName = String(body.displayName ?? "").trim();
  if (displayName.length < 2) throw new ApiError(400, "管理员姓名至少需要 2 个字符", "INVALID_DISPLAY_NAME");
  const now = new Date().toISOString();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const userId = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await db.update(users).set({ displayName, status: "active", updatedAt: now }).where(eq(users.id, userId));
  } else {
    await db.insert(users).values({ id: userId, email, displayName, status: "active", lastSeenAt: now });
  }
  const credential = await createPasswordCredential(password);
  await db.insert(authCredentials).values({ userId, ...credential, passwordChangedAt: now });
  await db.insert(userRoles).values({
    id: crypto.randomUUID(), userId, role: "platform_admin", scopeType: "global", scopeId: "*", grantedBy: "account-bootstrap",
  }).onConflictDoNothing();
  const token = await establishSession(request, userId);
  const principalHeaders = new Headers(request.headers);
  principalHeaders.set("cookie", `fabflow_session=${encodeURIComponent(token)}`);
  const principal = await getPrincipal(new Request(request.url, { method: "GET", headers: principalHeaders }));
  await writeAudit(request, principal, { action: "account.bootstrap_admin", entityType: "user", entityId: userId, after: { email, displayName, role: "platform_admin" } });
  return { token, principal };
}

async function login(request: Request, body: LoginBody) {
  const email = normalizedEmail(body.email);
  const password = String(body.password ?? "");
  const db = getDb();
  const [row] = await db.select({ user: users, credential: authCredentials })
    .from(users).innerJoin(authCredentials, eq(authCredentials.userId, users.id)).where(eq(users.email, email)).limit(1);
  const genericFailure = () => new ApiError(401, "邮箱或密码错误", "INVALID_CREDENTIALS");
  if (!row || row.user.status !== "active") throw genericFailure();
  const nowMs = Date.now();
  if (row.credential.lockedUntil && new Date(row.credential.lockedUntil).getTime() > nowMs) {
    throw new ApiError(429, "登录失败次数过多，请 15 分钟后再试", "ACCOUNT_LOCKED");
  }
  if (!(await verifyPassword(password, row.credential))) {
    const failedAttempts = row.credential.failedAttempts + 1;
    const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(nowMs + LOCK_SECONDS * 1000).toISOString() : null;
    await db.update(authCredentials).set({ failedAttempts, lockedUntil, updatedAt: new Date().toISOString() }).where(eq(authCredentials.userId, row.user.id));
    if (lockedUntil) throw new ApiError(429, "登录失败次数过多，账号已锁定 15 分钟", "ACCOUNT_LOCKED");
    throw genericFailure();
  }
  await db.update(authCredentials).set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date().toISOString() }).where(eq(authCredentials.userId, row.user.id));
  const token = await establishSession(request, row.user.id);
  const headers = new Headers(request.headers);
  headers.set("cookie", `fabflow_session=${encodeURIComponent(token)}`);
  const principal = await getPrincipal(new Request(request.url, { method: "GET", headers }));
  await writeAudit(request, principal, { action: "account.login", entityType: "user", entityId: row.user.id });
  return { token, principal };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as LoginBody;
    const result = body.action === "bootstrap" ? await bootstrap(request, body) : await login(request, body);
    return Response.json({ principal: result.principal }, {
      headers: { "set-cookie": sessionCookie(result.token, requestUsesHttps(request)), "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
