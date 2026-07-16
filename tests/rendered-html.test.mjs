import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("build emits the FabFlow product worker", async () => {
  await access("dist/server/index.js");
  const page = await readFile("app/page.tsx", "utf8");
  const layout = await readFile("app/layout.tsx", "utf8");
  assert.match(page, /FabFlow/);
  assert.match(page, /动力公用工程/);
  assert.match(layout, /FabFlow · 厂务流体智能选型系统/);
  assert.doesNotMatch(page, /Your site is taking shape|Codex is building|Starter Project|SkeletonPreview|react-loading-skeleton/i);
});

test("keeps the authoritative data workflow wired", async () => {
  const [masterPage, masterApi, schema, migration, auth] = await Promise.all([
    readFile("app/master-data.tsx", "utf8"),
    readFile("app/api/master-data/route.ts", "utf8"),
    readFile("db/schema.ts", "utf8"),
    readFile("drizzle/0002_wealthy_praxagora.sql", "utf8"),
    readFile("lib/auth.ts", "utf8"),
  ]);
  assert.match(masterPage, /批量导入/);
  assert.match(masterPage, /上传附件/);
  assert.match(masterPage, /api\/master-data/);
  assert.match(masterApi, /export async function PATCH/);
  assert.match(masterApi, /export async function DELETE/);
  assert.match(masterApi, /writeAudit/);
  assert.match(schema, /export const bomItems/);
  assert.match(migration, /CREATE TABLE `bom_items`/);
  assert.match(auth, /"data:write"/);
});
