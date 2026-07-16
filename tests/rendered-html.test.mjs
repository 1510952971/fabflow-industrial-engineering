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
  const [masterPage, masterApi, workflowApi, schema, migration, workflowMigration, auth] = await Promise.all([
    readFile("app/master-data.tsx", "utf8"),
    readFile("app/api/master-data/route.ts", "utf8"),
    readFile("app/api/workflow-actions/route.ts", "utf8"),
    readFile("db/schema.ts", "utf8"),
    readFile("drizzle/0002_wealthy_praxagora.sql", "utf8"),
    readFile("drizzle/0003_special_hairball.sql", "utf8"),
    readFile("lib/auth.ts", "utf8"),
  ]);
  assert.match(masterPage, /批量导入/);
  assert.match(masterPage, /上传附件/);
  assert.match(masterPage, /api\/master-data/);
  assert.match(masterApi, /export async function PATCH/);
  assert.match(masterApi, /export async function DELETE/);
  assert.match(masterApi, /writeAudit/);
  assert.match(workflowApi, /export async function (GET|POST)/);
  assert.match(workflowApi, /export async function PATCH/);
  assert.match(workflowApi, /export async function DELETE/);
  assert.match(schema, /export const bomItems/);
  assert.match(schema, /export const managementOfChanges/);
  assert.match(schema, /export const constructionWorkPackages/);
  assert.match(schema, /export const workflowActions/);
  assert.match(migration, /CREATE TABLE `bom_items`/);
  assert.match(workflowMigration, /CREATE TABLE `management_of_changes`/);
  assert.match(workflowMigration, /CREATE TABLE `construction_work_packages`/);
  assert.match(workflowMigration, /CREATE TABLE `workflow_actions`/);
  assert.match(auth, /"data:write"/);
});

test("all visible buttons execute a real action or are explicitly disabled", async () => {
  const files = [
    "app/page.tsx", "app/modules.tsx", "app/global-fab.tsx", "app/engineering-execution.tsx",
    "app/program-controls.tsx", "app/system-engineering.tsx", "app/data-foundation.tsx",
    "app/equipment-factory.tsx", "app/master-data.tsx",
  ];
  let total = 0;
  let unwired = 0;
  let notifyOnly = 0;
  const realAction = /(downloadCsv|downloadText|copyText|openMasterData|set[A-Z]|update\(|approve\(|close\(|toggle\(|resolve\(|freeze\(|syncSource|export[A-Z]|add[A-Z]|apply[A-Z]|window\.|document\.)/;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    let start = 0;
    while ((start = source.indexOf("<button", start)) >= 0) {
      const end = source.indexOf("</button>", start);
      assert.notEqual(end, -1, `${file} has an unterminated button`);
      const button = source.slice(start, end + 9);
      total += 1;
      if (!/onClick=/.test(button) && !/disabled/.test(button)) unwired += 1;
      if (/notify\s*\(/.test(button) && !realAction.test(button)) notifyOnly += 1;
      start = end + 9;
    }
  }
  assert.ok(total >= 200, `expected the complete UI button surface, got ${total}`);
  assert.equal(unwired, 0);
  assert.equal(notifyOnly, 0);
});
