import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { evaluatePipeSelection } from "../lib/pipe-selection-engine.ts";
import { validateEngineeringProject } from "../lib/engineering-validation.ts";
import { facilitySystems } from "../lib/facility-systems.ts";

const basis = {
  sourceType: "interface",
  sourceId: "if-1",
  sourceLabel: "IF-SGAS-001",
  systemId: "sys-sgas",
  medium: "SiH4",
  designPressureMpa: 1,
  designTemperatureC: 60,
  connectionStandard: "VCR",
  nominalSize: "1/4”",
  cleanlinessGrade: "UHP",
};

test("pipe selection score is calculated from seven engineering checks", () => {
  const result = evaluatePipeSelection({ id: "VCR-4", name: "VCR 接头", systemId: "sys-sgas", connection: "VCR", material: "316L EP", pressure: 8.3, size: "1/4\"", temp: 120, cleanliness: "UHP", pack: "1", price: 1 }, basis);
  assert.equal(result.status, "pass");
  assert.equal(result.score, 100);
  assert.equal(result.checks.length, 7);
});

test("pipe selection blocks insufficient pressure and incompatible interface", () => {
  const result = evaluatePipeSelection({ id: "BAD", name: "不匹配接头", systemId: "sys-sgas", connection: "法兰", material: "304L", pressure: .5, size: "DN25", temp: 50, cleanliness: "Industrial", pack: "1", price: 1 }, basis);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((message) => message.includes("低于设计压力")));
  assert.ok(result.blockers.some((message) => message.includes("需要 VCR")));
});

test("project validation finds incomplete tags, interface underrating and open A punch", () => {
  const result = validateEngineeringProject({
    systems: [{ id: "s1", code: "SGAS", name: "电子特气", discipline: "PROC", designMaturity: 70, status: "design" }],
    tags: [{ id: "t1", systemId: "s1", tagNo: "SGAS-001", medium: "SiH4", designPressureMpa: 1, designTemperatureC: null, status: "design" }],
    interfaces: [{ id: "i1", fromTagId: "t1", interfaceCode: "IF-001", medium: "SiH4", connectionStandard: "VCR", nominalSize: "1/4\"", designPressureMpa: .5, designTemperatureC: 60, cleanlinessGrade: "UHP", ownerDiscipline: "Process", status: "open" }],
    bomItems: [],
    testPacks: [],
    punchItems: [{ id: "p1", systemId: "s1", punchNumber: "P-A-001", category: "A", description: "气密试验未完成", status: "open" }],
    selectionRuns: [],
  });
  assert.ok(result.issues.some((issue) => issue.id === "tag:t1:basis"));
  assert.ok(result.issues.some((issue) => issue.id === "interface:i1:pressure"));
  assert.equal(result.summary.classAPunches, 1);
  assert.ok(result.summary.criticalIssues >= 3);
});

test("pipe selection covers the unified 13-system directory and custom material master data", async () => {
  const source = await readFile(new URL("../app/pipe-selection.tsx", import.meta.url), "utf8");
  for (const system of facilitySystems) assert.match(source, new RegExp(`systemId: "${system.id}"`), `${system.code} must have a standard candidate`);
  assert.match(source, /entities=tags,interfaces,materials/);
  assert.match(source, /materialId: item\.materialId/);
  assert.doesNotMatch(source, /97 - index \* 3/);
});