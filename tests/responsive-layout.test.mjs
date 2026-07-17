import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("small laptop master-data layout preserves readable type hierarchy and usable proportions", async () => {
  const masterCss = await readFile(new URL("../app/master-data.css", import.meta.url), "utf8");
  const globalCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(masterCss, /--master-micro:10px/);
  assert.match(masterCss, /--master-helper:11px/);
  assert.match(masterCss, /--master-control:13px/);
  assert.match(masterCss, /--master-section:18px/);
  assert.match(masterCss, /--master-page:23px/);
  assert.match(masterCss, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(masterCss, /grid-template-columns:minmax\(150px,\.52fr\) minmax\(300px,\.95fr\) minmax\(540px,1\.9fr\)/);
  assert.match(masterCss, /overflow-y:auto/);
  assert.match(globalCss, /max-width:1680px/);
  assert.match(globalCss, /@media\(max-width:1500px\)[\s\S]*?\.sidebar\{width:224px/);
});