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
test("global parameter matching supports all catalog categories", () => {
  const globalRequirement = { ...requirement, categoryId: "", systemCode: "" };
  const result = evaluateCatalogCandidate(globalRequirement, { ...goodProduct, categoryId: "cat-other" });
  assert.equal(result.status, "passed");
  assert.equal(result.score, 100);
  assert.ok(!result.checks.some((item) => item.code === "category"));
});

test("product catalog exposes the all-library parameter matcher", async () => {
  const page = await readFile("app/product-catalog-page.tsx", "utf8");
  assert.match(page, /catalogQuickMatch/);
  assert.match(page, /runQuickMatch/);
  assert.match(page, /productCategories,productParameterDefinitions,materials/);
  assert.match(page, /payload\.applications/);
  assert.match(page, /quickCandidates/);
});
test("legacy material master rows can participate in all-library matching", () => {
  const materialRequirement = { categoryId: "", systemCode: "", designPressureMpa: 5, designTemperatureC: 60, requiredMaterialsJson: ["316L"] };
  const materialCandidate = {
    id: "material:316l", categoryId: "", brand: "Facility Construction Management Software Approved", status: "approved", applicableSystemsJson: [], mediaJson: [],
    minPressureMpa: 0, maxPressureMpa: 10, minTemperatureC: -20, maxTemperatureC: 100, nominalSize: null, connectionStandard: null,
    wettedMaterialsJson: ["316L", "EP"], certificationsJson: [], standardsJson: [], specificationsJson: {},
  };
  const result = evaluateCatalogCandidate(materialRequirement, materialCandidate);
  assert.equal(result.status, "passed");
});
test("custom product specifications participate in engineering matching", () => {
  const customKey = "custom_filter_accuracy";
  const customRequirement = { ...requirement, requiredSpecificationsJson: { [customKey]: { max: 0.01 } } };
  const product = { ...goodProduct, specificationsJson: { [customKey]: 0.005, __customFields: [{ id: "filter", key: customKey, label: "过滤精度", unit: "μm", dataType: "number" }] } };
  const passed = evaluateCatalogCandidate(customRequirement, product);
  assert.equal(passed.status, "passed");
  assert.ok(passed.checks.some((item) => item.code === "spec." + customKey && item.status === "pass"));
  const blocked = evaluateCatalogCandidate(customRequirement, { ...product, specificationsJson: { ...product.specificationsJson, [customKey]: 0.02 } });
  assert.equal(blocked.status, "blocked");
});
