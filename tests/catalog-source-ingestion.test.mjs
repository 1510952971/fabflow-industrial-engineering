import assert from "node:assert/strict";
import test from "node:test";
import { classifyCatalogSource, createCatalogSourceManifestEntry, inferCatalogHints, summarizeCatalogSources } from "../lib/catalog-source-ingestion.ts";

test("classifies heterogeneous catalogue sources", () => {
  assert.equal(classifyCatalogSource("Catalog/valve-datasheet.pdf").documentType, "manufacturer_catalog");
  assert.equal(classifyCatalogSource("submittal/APTECH/brand-parameter.xlsx").documentType, "parameter_sheet");
  assert.equal(classifyCatalogSource("submittal/PLC/RIO-panel.dwg").documentType, "control_io_drawing");
  assert.equal(classifyCatalogSource("Catalog/product.jpg").documentType, "product_image");
  assert.equal(classifyCatalogSource("old/manual.zip").documentType, "archive");
});

test("infers manufacturer and model without promoting a product", () => {
  const entry = createCatalogSourceManifestEntry({ root: "materials", relativePath: "APTECH/AP74100SM-MV4-FV4.pdf", sizeBytes: 1234 });
  assert.equal(entry.manufacturerHint, "APTECH");
  assert.match(entry.modelHint, /AP74100SM/);
  assert.equal(entry.parserType, "pdf_text");
  assert.equal(entry.contentType, "application/pdf");
  assert.equal(inferCatalogHints("Honeywell-FSL-100.pdf").modelHint, "FSL-100");
});

test("summarizes the full manifest", () => {
  const first = createCatalogSourceManifestEntry({ root: "materials", relativePath: "a.pdf", sizeBytes: 100 });
  const second = createCatalogSourceManifestEntry({ root: "materials", relativePath: "b.dwg", sizeBytes: 200 });
  const summary = summarizeCatalogSources([first, second]);
  assert.equal(summary.total, 2);
  assert.equal(summary.bytes, 300);
  assert.equal(summary.byType.equipment_drawing, 1);
});

test("wires the administrator source registry and review queue", async () => {
  const [schema, api, page, drawer] = await Promise.all([
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../db/schema.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/api/catalog-sources/route.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/product-catalog-page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/catalog-source-import.tsx", import.meta.url), "utf8")),
  ]);
  assert.match(schema, /catalogSourceDocuments/);
  assert.match(schema, /catalogSourceCandidates/);
  assert.match(api, /register_manifest/);
  assert.match(api, /platform_admin/);
  assert.match(page, /onUseCandidate={startFromCandidate}/);
  assert.match(drawer, /CatalogSourceImport/);
});
