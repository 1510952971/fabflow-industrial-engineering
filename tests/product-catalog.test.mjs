import test from "node:test";
import assert from "node:assert/strict";
import { catalogCategoryTemplates, catalogCoverageSummary, validateProductSpecifications } from "../lib/product-catalog.ts";

test("product catalog taxonomy covers every FAB facility system", () => {
  const summary = catalogCoverageSummary();
  assert.equal(summary.categoryCount, 21);
  assert.equal(summary.parameterCount, 144);
  assert.deepEqual(summary.coveredSystems, ["BSGS", "CDA", "CDS", "CHW", "CR", "CTRL", "EXH", "FIRE", "HUP", "PCW", "SGAS", "UPW", "WWT"]);
  assert.ok(catalogCategoryTemplates.some((category) => category.code === "GENERAL_PRODUCT"));
});

test("dynamic product specification validation catches missing and invalid values", () => {
  const regulator = catalogCategoryTemplates.find((category) => category.code === "REGULATOR");
  assert.ok(regulator);
  const definitions = regulator.parameters.map((definition) => ({ ...definition, categoryId: regulator.id }));
  const missing = validateProductSpecifications({ regulationType: "single_stage" }, definitions);
  assert.equal(missing.valid, false);
  assert.ok(missing.issues.some((issue) => issue.key === "inletPressureRating"));
  const valid = validateProductSpecifications({ regulationType: "single_stage", inletPressureRating: 20.7, outletPressureRange: "0.2-1.7", cv: 0.06, seatMaterial: "PCTFE" }, definitions);
  assert.equal(valid.valid, true);
  const invalid = validateProductSpecifications({ regulationType: "invalid", inletPressureRating: -1, outletPressureRange: "0.2-1.7", cv: "not-a-number", seatMaterial: "PCTFE" }, definitions);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.length >= 3);
});

test("catalog product entry supports repeatable custom specification fields", async () => {
  const [page, css] = await Promise.all([
    (await import("node:fs/promises")).readFile(new URL("../app/product-catalog-page.tsx", import.meta.url), "utf8"),
    (await import("node:fs/promises")).readFile(new URL("../app/product-catalog.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /添加自定义规格/);
  assert.match(page, /CUSTOM_SPEC_META_KEY/);
  assert.match(page, /customKeyFromLabel/);
  assert.match(page, /\u5339\u914d\u952e/);
  assert.match(page, /serializeSpecifications/);
  assert.match(page, /字段名称/);
  assert.match(page, /数据类型/);
  assert.match(page, /\u8bf4\u660e.*\u6761\u4ef6/);
  assert.match(page, /customValidationIssues/);
  assert.match(css, /catalogCustomRow/);
});

test("catalog UI and API expose source traceability, variants, applications and global authorization", async () => {


  const source = await (await import("node:fs/promises")).readFile(new URL("../app/product-catalog-page.tsx", import.meta.url), "utf8");
  assert.match(source, /productCategories,productParameterDefinitions,catalogProducts,productVariants,productApplications/);
  assert.match(source, /sourceDocument/);
  assert.match(source, /适用系统/);
  assert.match(source, /按规格书选型/);
  assert.doesNotMatch(source, /const addToBom/);
  assert.match(source, /type="file"/);
  assert.match(source, /product_image/);
  assert.match(source, /imagesJson/);
  assert.match(source, /existingCount/);
  assert.match(source, /failed image upload retries with PATCH/);
  assert.match(source, /archiveProductImage\(uploaded\.id\)/);
  const filesRoute = await (await import("node:fs/promises")).readFile(new URL("../app/api/files/route.ts", import.meta.url), "utf8");
  assert.match(filesRoute, /catalogProducts/);
  assert.match(filesRoute, /inline/);});
