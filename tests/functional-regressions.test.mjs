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
