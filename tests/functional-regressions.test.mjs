import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("system list export supplies CSV headers and row arrays", async () => {
  const source = await readFile(new URL("../app/system-engineering.tsx", import.meta.url), "utf8");
  assert.match(
    source,
    /downloadCsv\("fabflow-system-list\.csv",\[[^\]]+\],systems\.map\(x=>\[[^\]]+\]\)\)/,
  );
});

test("data foundation defines and wires the JSON schema copy action", async () => {
  const source = (await readFile(new URL("../app/data-foundation.tsx", import.meta.url), "utf8")) + (await readFile(new URL("../app/integration-console.tsx", import.meta.url), "utf8"));
  assert.match(source, /const copySchema = \(\) =>/);
  assert.match(source, /copySchema=\{copySchema\}/);
  assert.match(source, /onClick=\{copySchema\}/);
});
