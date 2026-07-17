import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateCatalogCandidate, matchCatalog } from "../lib/catalog-selection-engine.ts";

const requirement = {
  categoryId: "cat-valve",
  systemCode: "SGAS",
  medium: "SiH4",
  designPressureMpa: 10,
  designTemperatureC: 80,
  nominalSize: "1/4 in",
  connectionStandard: "VCR",
  requiredMaterialsJson: ["316L VAR", "PCTFE"],
  requiredCertificationsJson: ["CE"],
  requiredStandardsJson: ["SEMI F20"],
  requiredBrandsJson: ["Fujikin", "Swagelok"],
  requiredSpecificationsJson: { cv: { min: 0.05 }, leakRate: { max: 1e-9 } },
};

const goodProduct = {
  id: "product-good",
  categoryId: "cat-valve",
  brand: "Fujikin",
  status: "approved",
  applicableSystemsJson: ["SGAS", "BSGS"],
  mediaJson: ["SiH4", "H2"],
  minPressureMpa: 0,
  maxPressureMpa: 20.7,
  minTemperatureC: -20,
  maxTemperatureC: 120,
  nominalSize: "1/4 in",
  connectionStandard: "VCR",
  wettedMaterialsJson: ["316L VAR", "PCTFE"],
  certificationsJson: ["CE"],
  standardsJson: ["SEMI F20"],
  specificationsJson: { cv: 0.08, leakRate: 1e-10 },
};

test("project requirements match global catalog candidates without copying catalog rows", () => {
  const match = evaluateCatalogCandidate(requirement, goodProduct);
  assert.equal(match.status, "passed");
  assert.equal(match.score, 100);
  assert.ok(match.checks.every((item) => item.status === "pass"));

  const blocked = evaluateCatalogCandidate(requirement, { ...goodProduct, id: "bad", brand: "Unknown", maxPressureMpa: 5, connectionStandard: "NPT" });
  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.checks.some((item) => item.code === "pressure" && item.status === "fail"));
  assert.ok(blocked.checks.some((item) => item.code === "connection" && item.status === "fail"));
  assert.ok(blocked.checks.some((item) => item.code === "brand" && item.status === "fail"));
  assert.equal(matchCatalog(requirement, [{ ...goodProduct, id: "good" }, { ...goodProduct, id: "bad", maxPressureMpa: 1 }])[0].productId, "good");
});

test("catalog is global while project requirements, runs and selections are project-scoped", async () => {
  const [schema, masterRoute, selectionRoute, page, projectPanel] = await Promise.all([
    readFile("db/schema.ts", "utf8"),
    readFile("app/api/master-data/route.ts", "utf8"),
    readFile("app/api/catalog-selection/route.ts", "utf8"),
    readFile("app/product-catalog-page.tsx", "utf8"),
    readFile("app/project-catalog-selection.tsx", "utf8"),
  ]);
  const catalogBlock = schema.slice(schema.indexOf("export const catalogProducts"), schema.indexOf("export const productVariants"));
  assert.doesNotMatch(catalogBlock, /projectId:/);
  assert.match(schema, /projectProductRequirements[\s\S]+projectId:/);
  assert.match(schema, /catalogSelectionRuns[\s\S]+requirementId:/);
  assert.match(masterRoute, /projectProductRequirements: projectProductRequirements\.projectId/);
  assert.match(selectionRoute, /TECHNICAL_SPEC_REQUIRED/);
  assert.match(selectionRoute, /SELECTION_BLOCKED/);
  assert.match(selectionRoute, /sourceType: "catalog_selection"/);
  assert.match(page, /全局设备材料型录库/);
  assert.doesNotMatch(page, /const addToBom/);
  assert.match(projectPanel, /项目技术规格选型/);
  assert.match(projectPanel, /technical_specification/);
  assert.match(projectPanel, /匹配全局型录/);
});