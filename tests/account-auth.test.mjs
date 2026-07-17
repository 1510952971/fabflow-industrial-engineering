import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("passwords and sessions use one-way storage and secure browser cookies", async () => {
  const [auth, schema, login] = await Promise.all([
    readFile("lib/account-auth.ts", "utf8"),
    readFile("db/schema.ts", "utf8"),
    readFile("app/api/auth/login/route.ts", "utf8"),
  ]);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /SHA-256/);
  assert.match(auth, /HttpOnly; SameSite=Lax/);
  assert.match(auth, /PASSWORD_ITERATIONS = 210_000/);
  assert.match(schema, /authCredentials/);
  assert.match(schema, /authSessions/);
  assert.match(schema, /tokenHash/);
  assert.doesNotMatch(schema, /text\("password"\)/);
  assert.match(login, /MAX_FAILED_ATTEMPTS/);
  assert.match(login, /ACCOUNT_LOCKED/);
  assert.match(login, /AUTH_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(login, /new Request\(request, \{ headers/);
});

test("admin account management is server-authorized and protects the last administrator", async () => {
  const [route, panel] = await Promise.all([
    readFile("app/api/access/route.ts", "utf8"),
    readFile("app/account-admin.tsx", "utf8"),
  ]);
  assert.match(route, /authorize\(request, "roles:manage"\)/);
  assert.match(route, /LAST_ADMIN_BLOCKED/);
  assert.match(route, /SELF_LOCKOUT_BLOCKED/);
  assert.match(route, /authSessions[\s\S]+status: "revoked"/);
  for (const action of ["create_user", "reset_password", "set_status", "grant", "revoke"]) {
    assert.match(route, new RegExp(action));
  }
  assert.match(panel, /action: "create_user"/);
  assert.match(panel, /action: "reset_password"/);
  assert.match(panel, /action: "set_status"/);
  assert.match(panel, /action: "grant"/);
  assert.match(panel, /action: "revoke"/);
});

test("login UI replaces the disabled write button with a real account flow", async () => {
  const [page, modal] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/login-modal.tsx", "utf8"),
  ]);
  assert.match(page, /<LoginModal/);
  assert.match(page, /setLoginOpen\(true\)/);
  assert.doesNotMatch(page, /className="primary" disabled=\{!canWrite\}/);
  assert.match(modal, /\/api\/auth\/login/);
  assert.match(modal, /\/api\/auth\/session/);
});
