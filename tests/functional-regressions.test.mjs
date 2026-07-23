import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("system validation export supplies CSV headers and current-project rows", async () => {
  const source = await readFile(new URL("../app/system-engineering.tsx", import.meta.url), "utf8");
  assert.match(
    source,
    /downloadCsv\("fabflow-system-validation\.csv", \["系统编码"[^\r\n]+data\?\.systems/,
  );
});

test("data foundation defines and wires the JSON schema copy action", async () => {
  const source = (await readFile(new URL("../app/data-foundation.tsx", import.meta.url), "utf8")) + (await readFile(new URL("../app/integration-console.tsx", import.meta.url), "utf8"));
  assert.match(source, /const copySchema = \(\) =>/);
  assert.match(source, /copySchema=\{copySchema\}/);
  assert.match(source, /onClick=\{copySchema\}/);
});

test("Cloudflare App Router keeps explicit Vinext RSC environments", async () => {
  const source = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(source, /import rsc from "@vitejs\/plugin-rsc"/);
  assert.match(source, /vinext\(\{\s*rsc:\s*false\s*\}\)/);
  assert.match(source, /dedupe:\s*\["react",\s*"react-dom",\s*"react\/jsx-runtime",\s*"react\/jsx-dev-runtime"\]/);
  assert.match(source, /rsc:\s*"virtual:vinext-rsc-entry"/);
  assert.match(source, /ssr:\s*"virtual:vinext-app-ssr-entry"/);
  assert.match(source, /client:\s*"virtual:vinext-app-browser-entry"/);
});

test("equipment validation chunks D1 result writes and removes partial runs on failure", async () => {
  const source = await readFile(new URL("../app/api/equipment/validate/route.ts", import.meta.url), "utf8");
  assert.ok(source.includes("offset < resultRows.length; offset += 10"));
  assert.ok(source.includes("resultRows.slice(offset, offset + 10)"));
  assert.ok(source.includes("db.delete(selectionResults).where(eq(selectionResults.runId, runId))"));
  assert.ok(source.includes("db.delete(selectionRuns).where(eq(selectionRuns.id, runId))"));
});

test("unexpected API failures do not expose database statements or bound values", async () => {
  const source = await readFile(new URL("../lib/api.ts", import.meta.url), "utf8");
  assert.match(source, /服务端处理失败，请稍后重试或联系管理员/);
  assert.doesNotMatch(source, /const message = error instanceof Error/);
});

test("project module route initializes the requested module before hydration", async () => {
  const route = await readFile(new URL("../app/projects/[projectId]/[module]/page.tsx", import.meta.url), "utf8");
  const context = await readFile(new URL("../lib/project-context.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.ok(route.includes("initialProjectId={decodeURIComponent(route.projectId)} initialModule={moduleFromSlug(route.module)}"));
  assert.match(context, /export function moduleFromSlug/);
  assert.ok(page.includes("useState(initialModule)"));
  assert.ok(page.includes("useState(initialProjectId)"));
});
