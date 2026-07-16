import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("file evidence supports versions, downloads, signatures and archive protection", async () => {
  const [route, schema] = await Promise.all([
    readFile("app/api/files/route.ts", "utf8"),
    readFile("db/schema.ts", "utf8"),
  ]);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /body\.action === "sign"/);
  assert.match(route, /FILE_ARCHIVED/);
  assert.match(route, /version = Number\(total\) \+ 1/);
  assert.match(schema, /signedBy: text\("signed_by"\)/);
  assert.match(schema, /sha256: text\("sha256"\)/);
});

test("external event consumers cover ERP, QMS, schedule, equipment vendors and operations", async () => {
  const route = await readFile("app/api/integrations/events/route.ts", "utf8");
  for (const eventType of [
    "erp.po.upsert",
    "qms.test_pack.upsert",
    "qms.punch.upsert",
    "schedule.milestone.upsert",
    "vendor.equipment_model.upsert",
    "vendor.equipment_component.upsert",
  ]) {
    assert.match(route, new RegExp(eventType.replaceAll(".", "\\.")));
  }
  assert.match(route, /body\.eventType\.startsWith\("bms\."\)/);
  assert.match(route, /body\.eventType\.startsWith\("epms\."\)/);
  assert.match(route, /body\.eventType\.startsWith\("scada\."\)/);
  assert.match(route, /idempotency-key/);
  assert.match(route, /CONNECTOR_NOT_ENABLED/);
  assert.match(route, /retryCount >= 5/);
  assert.match(route, /status: "healthy"/);
});

test("the integration console exposes every requested enterprise source without fake health", async () => {
  const source = await readFile("app/data-foundation.tsx", "utf8");
  for (const id of ["ERP", "SCHED", "QMS", "VENDOR", "BMS", "EPMS", "SCADA"]) {
    assert.match(source, new RegExp(`id: "${id}"`));
  }
  assert.match(source, /配置连接器/);
  assert.match(source, /密钥仍由部署环境安全绑定/);
  assert.doesNotMatch(source, /status: "健康"[^\n]+未连接/);
});

test("client code no longer embeds a fixed project id", async () => {
  const files = [
    "app/page.tsx",
    "app/master-data.tsx",
    "app/equipment-factory.tsx",
    "app/media-conditions.tsx",
    "lib/project-context.ts",
    "lib/client-actions.ts",
    "lib/bom-actions.ts",
  ];
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
  sources.forEach((source, index) => assert.doesNotMatch(source, /proj-fab2a/, files[index]));
});

test("local runbook initializes D1 before starting the app", async () => {
  const [readme, packageJson, wrangler] = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("package.json", "utf8"),
    readFile("wrangler.jsonc", "utf8"),
  ]);
  assert.match(readme, /npm run db:migrate:local/);
  assert.match(packageJson, /db:migrate:local/);
  assert.match(wrangler, /"migrations_dir": "drizzle"/);
});
