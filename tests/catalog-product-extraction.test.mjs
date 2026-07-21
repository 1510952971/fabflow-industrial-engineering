import assert from "node:assert/strict";
import test from "node:test";
import { catalogProductIdentity, extractCatalogProductsFromSource, extractModelCodes, inferCatalogBrand, inferCatalogCategory, isProductBearingCatalogSource } from "../lib/catalog-product-extraction.ts";
import { createCatalogSourceManifestEntry } from "../lib/catalog-source-ingestion.ts";

const entry = (relativePath, extension) => createCatalogSourceManifestEntry({ root: "\u6750\u6599\u578b\u5f55", relativePath, sizeBytes: 100, contentType: extension });

test("extracts and expands product series from catalog filenames", () => {
  assert.deepEqual(extractModelCodes("Catalog \u578b\u5f55/Catalog \u578b\u5f55/AP tech/UHP Valves/AP3200&3260.pdf"), ["AP3200", "AP3260"]);
  assert.deepEqual(extractModelCodes("Catalog \u578b\u5f55/Catalog \u578b\u5f55/CONCOA/100 Series/ADC 3010 AC 109 Series Dual Stage Regulator.pdf").includes("109 SERIES"), true);
  assert.deepEqual(extractModelCodes("4\u3001EFS-\u4e00\u7c7b-APTECH-AP74100SM MV4 FV4.pdf").includes("AP74100SM"), true);
});

test("maps manufacturer, category and submitted configuration", () => {
  const source = entry("\u6750\u6599\u56fe\u7eb8\u9001\u5ba1/\u54c1\u724c\u62a5\u5ba1-07-\u9694\u819c\u9600/APTECH/Dia valve-\u4e00\u7c7b-APTECH-AP3000SM 2PW FV4 FV4.pdf");
  assert.equal(inferCatalogBrand(source), "APTech");
  assert.equal(inferCatalogCategory(source.relativePath).id, "cat-diaphragm-valve");
  const products = extractCatalogProductsFromSource(source);
  assert.equal(products.length, 1);
  assert.equal(products[0].productCode, "AP3000SM-2PW-FV4-FV4");
  assert.equal(products[0].categoryId, "cat-diaphragm-valve");
});

test("rejects drawings and administrative spreadsheets as products", () => {
  const drawing = entry("\u6750\u6599\u56fe\u7eb8\u9001\u5ba1/L_J008-GMS-LAY-02-10-001-V3.0.dwg");
  const tracker = entry("\u6750\u56fe\u7eb8\u9001\u5ba1/\u9001\u5ba1\u6e05\u5355\u53ca\u9001\u5ba1\u8fdb\u5ea6\u8ddf\u8e2a-2023.10.20.xlsx");
  assert.equal(isProductBearingCatalogSource(drawing), false);
  assert.equal(isProductBearingCatalogSource(tracker), false);
  assert.deepEqual(extractCatalogProductsFromSource(drawing), []);
});

test("uses stable case-insensitive product identities", () => {
  assert.equal(catalogProductIdentity({ brand: "APTech", productCode: "AP3000SM FV4" }), catalogProductIdentity({ brand: "aptech", productCode: "AP3000SM-FV4" }));
});
