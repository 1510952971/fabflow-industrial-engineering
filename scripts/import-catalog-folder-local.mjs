#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { catalogProductIdentity, extractCatalogProductsFromSource, inferCatalogBrand, inferCatalogCategory, isProductBearingCatalogSource } from "../lib/catalog-product-extraction.ts";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const manifestPath = path.resolve("work/catalog-source-manifest.json");
const actor = "local-catalog-import@fabflow";
const minimumConfidence = 70;
const now = new Date().toISOString();
const stableId = (prefix, value) => prefix + "-" + createHash("sha256").update(value).digest("hex").slice(0, 32);
const json = (value) => JSON.stringify(value);
const parseJson = (value, fallback) => { try { return JSON.parse(value || ""); } catch { return fallback; } };
const unique = (values) => [...new Set(values.filter(Boolean))];
const cleanStem = (fileName) => fileName.replace(/\.[^.]+$/, "").replace(/^\s*\d+(?:[-._]\d+)*[\s\u3001._-]+/, "").replace(/\s*\(\d+\)\s*$/, "").trim();

async function findLocalDatabase() {
  const folder = path.resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const files = [];
  for (const name of await readdir(folder)) {
    if (!name.endsWith(".sqlite") || name === "metadata.sqlite") continue;
    const fullPath = path.join(folder, name);
    files.push({ fullPath, size: (await stat(fullPath)).size });
  }
  files.sort((a, b) => b.size - a.size);
  if (!files[0]) throw new Error("\u672a\u627e\u5230\u672c\u5730 D1 \u6570\u636e\u5e93\uff0c\u8bf7\u5148\u8fd0\u884c npm run db:migrate:local");
  return files[0].fullPath;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!Array.isArray(manifest.entries) || !manifest.entries.length) throw new Error("\u8d44\u6599\u6e05\u5355\u4e3a\u7a7a\uff0c\u8bf7\u5148\u8fd0\u884c npm run catalog:manifest");

const sourcePlans = [];
const productGroups = new Map();
for (const entry of manifest.entries) {
  const detections = extractCatalogProductsFromSource(entry);
  const accepted = detections.filter((item) => item.confidence >= minimumConfidence);
  const productKeys = [];
  for (const product of accepted) {
    const key = catalogProductIdentity(product);
    productKeys.push(key);
    const existing = productGroups.get(key);
    if (existing) {
      existing.sources.push(entry.relativePath);
      existing.confidence = Math.max(existing.confidence, product.confidence);
      existing.systems = unique([...existing.systems, ...product.systems]);
    } else productGroups.set(key, { ...product, sources: [entry.relativePath] });
  }
  const bearing = isProductBearingCatalogSource(entry);
  const extractionStatus = accepted.length ? "needs_review" : bearing ? "queued" : "completed";
  sourcePlans.push({ entry, detections, accepted, productKeys, bearing, extractionStatus });
}

const preview = {
  generatedAt: now,
  sourceDocuments: sourcePlans.length,
  productBearingSources: sourcePlans.filter((item) => item.bearing).length,
  detectedProductsBeforeDeduplication: sourcePlans.reduce((sum, item) => sum + item.accepted.length, 0),
  uniqueProductDrafts: productGroups.size,
  unresolvedProductSources: sourcePlans.filter((item) => item.bearing && !item.accepted.length).length,
  minimumConfidence,
};

if (!apply) {
  console.log(JSON.stringify({ mode: "preview", ...preview }, null, 2));
  process.exit(0);
}

const databasePath = await findLocalDatabase();
await mkdir(path.resolve("work/backups"), { recursive: true });
const backupPath = path.resolve("work/backups", "fabflow-d1-before-catalog-" + now.replace(/[:.]/g, "-") + ".sqlite");
await copyFile(databasePath, backupPath);

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 30000");

const existingProducts = new Map();
for (const row of db.prepare("SELECT id, brand, product_code AS productCode, specifications_json AS specificationsJson, source_document AS sourceDocument, status FROM catalog_products").all()) {
  existingProducts.set(catalogProductIdentity({ brand: row.brand, productCode: row.productCode }), row);
}

const insertSource = db.prepare(`INSERT INTO catalog_source_documents
  (id, source_key, source_root, relative_path, file_name, extension, content_type, size_bytes, modified_at, document_type, parser_type, manufacturer_hint, product_family_hint, model_hint, source_revision, extraction_status, extracted_json, error_message, created_by, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  ON CONFLICT(source_key) DO UPDATE SET source_root=excluded.source_root, relative_path=excluded.relative_path, file_name=excluded.file_name, extension=excluded.extension,
  content_type=excluded.content_type, size_bytes=excluded.size_bytes, modified_at=excluded.modified_at, document_type=excluded.document_type, parser_type=excluded.parser_type,
  manufacturer_hint=excluded.manufacturer_hint, product_family_hint=excluded.product_family_hint, model_hint=excluded.model_hint, source_revision=excluded.source_revision, updated_at=excluded.updated_at`);
const insertCandidate = db.prepare(`INSERT INTO catalog_source_candidates
  (id, source_document_id, candidate_key, product_name, manufacturer, brand, model, category_hint, systems_json, parameters_json, confidence, status, promoted_product_id, review_note, created_by, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)
  ON CONFLICT(candidate_key) DO UPDATE SET product_name=excluded.product_name, manufacturer=excluded.manufacturer, brand=excluded.brand, model=excluded.model,
  category_hint=excluded.category_hint, systems_json=excluded.systems_json, parameters_json=excluded.parameters_json, confidence=excluded.confidence,
  promoted_product_id=COALESCE(catalog_source_candidates.promoted_product_id, excluded.promoted_product_id), updated_at=excluded.updated_at`);
const insertProduct = db.prepare(`INSERT INTO catalog_products
  (id, category_id, manufacturer, brand, product_code, product_name, series, model, description, country, lifecycle_status, applicable_systems_json, media_json, images_json,
  wetted_materials_json, certifications_json, standards_json, specifications_json, source_document, revision, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'active', ?, '[]', '[]', '[]', '[]', '[]', ?, ?, 'A', 'draft', ?, ?)`);
const updateProductEvidence = db.prepare("UPDATE catalog_products SET specifications_json=?, source_document=COALESCE(NULLIF(source_document, ''), ?), updated_at=? WHERE id=?");
const insertApplication = db.prepare(`INSERT INTO product_applications (id, product_id, system_code, service, medium, suitability, limitations, created_at, updated_at)
  VALUES (?, ?, ?, 'catalog-auto-import', '', 'needs_review', '\u81ea\u52a8\u8bc6\u522b\u9002\u7528\u7cfb\u7edf\uff0c\u9700\u5de5\u7a0b\u5e08\u590d\u6838', ?, ?)
  ON CONFLICT(product_id, system_code, service) DO NOTHING`);
const insertAudit = db.prepare("INSERT INTO audit_logs (id, project_id, actor_email, action, entity_type, entity_id, before_json, after_json, request_id, source_ip, created_at) VALUES (?, NULL, ?, ?, ?, ?, NULL, ?, ?, '127.0.0.1', ?)");

let insertedProducts = 0;
let updatedProducts = 0;
let unresolvedCandidates = 0;
const resolvedProductIds = new Map();

db.exec("BEGIN IMMEDIATE");
try {
  for (const plan of sourcePlans) {
    const entry = plan.entry;
    const sourceId = stableId("src", entry.sourceKey);
    insertSource.run(sourceId, entry.sourceKey, entry.sourceRoot, entry.relativePath, entry.fileName, entry.extension, entry.contentType, entry.sizeBytes, entry.modifiedAt ?? null,
      entry.documentType, entry.parserType, entry.manufacturerHint ?? "", entry.productFamilyHint ?? "", entry.modelHint ?? "", entry.sourceRevision ?? "", plan.extractionStatus,
      json({ detectedProductKeys: plan.productKeys, detectionCount: plan.accepted.length, policy: "filename-and-folder-evidence; human-review-required" }), actor, now, now);
    if (plan.bearing && !plan.accepted.length) {
      const category = inferCatalogCategory(entry.relativePath);
      const brand = inferCatalogBrand(entry);
      const candidateKey = entry.sourceKey + "|unresolved";
      insertCandidate.run(stableId("cand", candidateKey), sourceId, candidateKey, cleanStem(entry.fileName), brand, brand, "", category.id, json(category.systems),
        json({ sourceFile: entry.relativePath, documentType: entry.documentType, reason: "\u672a\u4ece\u6587\u4ef6\u540d\u5b89\u5168\u8bc6\u522b\u51fa\u552f\u4e00\u578b\u53f7" }), 25, "needs_review", null, actor, now, now);
      unresolvedCandidates += 1;
    }
  }

  for (const [identity, group] of productGroups) {
    const sourceFiles = unique(group.sources).slice(0, 100);
    const autoImport = { method: "filename-and-folder", confidence: group.confidence, reviewRequired: true, evidenceSources: sourceFiles, importedAt: now };
    const existing = existingProducts.get(identity);
    let productId;
    if (existing) {
      productId = existing.id;
      const specifications = parseJson(existing.specificationsJson, {});
      specifications.autoImport = { ...(specifications.autoImport ?? {}), ...autoImport, evidenceSources: unique([...(specifications.autoImport?.evidenceSources ?? []), ...sourceFiles]).slice(0, 100) };
      updateProductEvidence.run(json(specifications), sourceFiles[0], now, productId);
      updatedProducts += 1;
    } else {
      productId = stableId("prod", identity);
      insertProduct.run(productId, group.categoryId, group.manufacturer, group.brand, group.productCode, group.productName, group.series, group.model,
        "\u4ece\u672c\u5730\u6750\u6599\u578b\u5f55\u81ea\u52a8\u8bc6\u522b\u5efa\u7acb\u7684\u4ea7\u54c1\u8349\u7a3f\uff0c\u53c2\u6570\u3001\u54c1\u724c\u548c\u9002\u7528\u6027\u5f85\u5de5\u7a0b\u5e08\u590d\u6838\u3002", json(group.systems), json({ autoImport }), sourceFiles[0], now, now);
      insertedProducts += 1;
    }
    resolvedProductIds.set(identity, productId);
    for (const systemCode of group.systems) insertApplication.run(stableId("app", productId + "|" + systemCode), productId, systemCode, now, now);
    const representativeSource = sourcePlans.find((item) => item.productKeys.includes(identity));
    if (representativeSource) {
      const sourceId = stableId("src", representativeSource.entry.sourceKey);
      const candidateKey = representativeSource.entry.sourceKey + "|" + identity;
      insertCandidate.run(stableId("cand", candidateKey), sourceId, candidateKey, group.productName, group.manufacturer, group.brand, group.model, group.categoryId,
        json(group.systems), json({ sourceFile: representativeSource.entry.relativePath, productCode: group.productCode, evidenceSources: sourceFiles }), group.confidence,
        "promoted", productId, actor, now, now);
    }
  }

  const result = { ...preview, insertedProducts, updatedProducts, unresolvedCandidates, databasePath, backupPath };
  insertAudit.run(stableId("audit", "catalog-folder-import|" + now), actor, "catalog_folder.bulk_import", "catalogProducts", "global-catalog", json(result), stableId("req", now), now);
  db.exec("COMMIT");
  await writeFile(path.resolve("work/catalog-import-result.json"), JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify({ mode: "applied", ...result }, null, 2));
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
