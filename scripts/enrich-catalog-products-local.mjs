import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractCatalogTechnicalData } from "../lib/catalog-content-extraction.ts";

const root = process.cwd();
const catalogRoot = path.join(root, "材料型录");
const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");
const maxPages = Number(process.env.CATALOG_MAX_PAGES ?? 20);
const maxSources = Number(process.env.CATALOG_MAX_SOURCES ?? 1);
const pdfjsRoot = path.dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));
const pdfCache = new Map();
const stateRoot = path.join(root, ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
const dbPath = fs.readdirSync(stateRoot).filter((name) => name.endsWith(".sqlite") && !name.includes("metadata"))
  .map((name) => path.join(stateRoot, name)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
if (!dbPath) throw new Error("找不到本地 D1，请先运行 npm run db:migrate:local");

const db = new DatabaseSync(dbPath);
const allProducts = db.prepare("select * from catalog_products where status = 'draft' order by id").all();
const productLimit = Number(process.env.CATALOG_PRODUCT_LIMIT ?? 0);
const products = productLimit > 0 ? allProducts.slice(0, productLimit) : allProducts;
const mergeArray = (before, after) => [...new Set([...(JSON.parse(before || "[]")), ...after])];
const parseObject = (value) => { try { const result = JSON.parse(value || "{}"); return result && typeof result === "object" && !Array.isArray(result) ? result : {}; } catch { return {}; } };
const existingPath = (relative) => {
  const direct = path.join(catalogRoot, relative);
  if (fs.existsSync(direct)) return direct;
  if (!relative.includes("/") && !relative.includes("\\")) {
    const source = db.prepare("select relative_path from catalog_source_documents where file_name = ? order by size_bytes desc limit 1").get(relative);
    if (source) return path.join(catalogRoot, source.relative_path);
  }
  return null;
};
async function readPdf(file) {
  if (pdfCache.has(file)) return pdfCache.get(file);
  const promise = (async () => {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true, verbosity: 0, cMapUrl: pathToFileURL(path.join(pdfjsRoot, "cmaps") + path.sep).href, cMapPacked: true, standardFontDataUrl: pathToFileURL(path.join(pdfjsRoot, "standard_fonts") + path.sep).href }).promise;
  const pageCount = doc.numPages; const pages = [];
  for (let number = 1; number <= Math.min(pageCount, maxPages); number += 1) {
    const page = await doc.getPage(number); const content = await page.getTextContent();
    const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
    if (text) pages.push({ page: number, text });
  }
  await doc.cleanup();
  return { pages, pageCount };
  })();
  pdfCache.set(file, promise);
  return promise;
}

const planned = []; const errors = []; let skipped = 0; let ocrRequired = 0; let sourcesParsed = 0;
for (let index = 0; index < products.length; index += 1) {
  const product = products[index]; const specs = parseObject(product.specifications_json); const autoImport = parseObject(specs.autoImport);
  if (!force && specs.sourceExtraction?.method === "pdfjs-text-v1") { skipped += 1; continue; }
  const evidenceSources = Array.isArray(autoImport.evidenceSources) ? autoImport.evidenceSources : [];
  const files = [...new Set(evidenceSources.map(existingPath).filter(Boolean).filter((file) => path.extname(file).toLowerCase() === ".pdf"))].slice(0, maxSources);
  if (!files.length && product.source_document) { const source = existingPath(product.source_document); if (source?.toLowerCase().endsWith(".pdf")) files.push(source); }
  if (!files.length) { skipped += 1; continue; }
  const pages = []; const sourceSummary = [];
  for (const file of files) {
    try {
      const cached = pdfCache.has(file); const parsed = await readPdf(file); if (!cached) sourcesParsed += 1;
      pages.push(...parsed.pages.map((page) => ({ ...page, source: path.relative(catalogRoot, file).replaceAll("\\", "/") })));
      sourceSummary.push({ path: path.relative(catalogRoot, file).replaceAll("\\", "/"), pageCount: parsed.pageCount, textPages: parsed.pages.length, textChars: parsed.pages.reduce((sum, page) => sum + page.text.length, 0) });
    } catch (error) { errors.push({ productCode: product.product_code, file, message: error instanceof Error ? error.message : String(error) }); }
  }
  const extracted = extractCatalogTechnicalData(pages, product.category_id, product.product_code);
  if (extracted.textChars < 80) ocrRequired += 1;
  const mergedSpecs = { ...specs, ...Object.fromEntries(Object.entries(extracted.specifications).filter(([, value]) => value !== undefined && value !== "")), sourceExtraction: { method: "pdfjs-text-v1", status: extracted.textChars >= 80 ? "needs_review" : "ocr_required", reviewRequired: true, extractedAt: new Date().toISOString(), sources: sourceSummary, textChars: extracted.textChars, evidence: extracted.evidence } };
  planned.push({ product, extracted, mergedSpecs });
  if ((index + 1) % 100 === 0) console.error(`已解析 ${index + 1}/${products.length}`);
}

const result = { mode: apply ? "applied" : "preview", productsConsidered: products.length, productsEnriched: planned.filter((item) => item.extracted.textChars >= 80).length, productsOcrRequired: ocrRequired, sourcesParsed, skipped, errors: errors.length };
if (!apply) { if (errors.length) result.errorSamples = errors.slice(0, 5); console.log(JSON.stringify(result, null, 2)); process.exit(0); }
const now = new Date().toISOString(); const backupDir = path.join(root, "work", "backups"); fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `fabflow-d1-before-content-enrichment-${now.replaceAll(":", "-").replaceAll(".", "-")}.sqlite`); fs.copyFileSync(dbPath, backupPath);
const update = db.prepare(`update catalog_products set min_pressure_mpa=?, max_pressure_mpa=?, min_temperature_c=?, max_temperature_c=?, nominal_size=?, connection_standard=?, wetted_materials_json=?, surface_finish=?, max_flow=?, flow_unit=?, supply_voltage=?, signal_protocol=?, ingress_protection=?, hazardous_area_rating=?, certifications_json=?, standards_json=?, specifications_json=?, source_page=?, updated_at=? where id=?`);
db.exec("begin immediate");
try {
  for (const { product, extracted, mergedSpecs } of planned) {
    const autoGenerated = mergedSpecs.autoImport?.method === "filename-and-folder";
    update.run(autoGenerated ? extracted.minPressureMpa : (product.min_pressure_mpa ?? extracted.minPressureMpa), autoGenerated ? extracted.maxPressureMpa : (product.max_pressure_mpa ?? extracted.maxPressureMpa), autoGenerated ? extracted.minTemperatureC : (product.min_temperature_c ?? extracted.minTemperatureC), autoGenerated ? extracted.maxTemperatureC : (product.max_temperature_c ?? extracted.maxTemperatureC), autoGenerated ? (extracted.nominalSize || null) : (product.nominal_size || extracted.nominalSize || null), autoGenerated ? (extracted.connectionStandard || null) : (product.connection_standard || extracted.connectionStandard || null), JSON.stringify(mergeArray(product.wetted_materials_json, extracted.wettedMaterials)), autoGenerated ? (extracted.surfaceFinish || null) : (product.surface_finish || extracted.surfaceFinish || null), autoGenerated ? extracted.maxFlow : (product.max_flow ?? extracted.maxFlow), autoGenerated ? (extracted.flowUnit || null) : (product.flow_unit || extracted.flowUnit || null), autoGenerated ? (extracted.supplyVoltage || null) : (product.supply_voltage || extracted.supplyVoltage || null), autoGenerated ? (extracted.signalProtocol || null) : (product.signal_protocol || extracted.signalProtocol || null), autoGenerated ? (extracted.ingressProtection || null) : (product.ingress_protection || extracted.ingressProtection || null), autoGenerated ? (extracted.hazardousAreaRating || null) : (product.hazardous_area_rating || extracted.hazardousAreaRating || null), JSON.stringify(mergeArray(product.certifications_json, extracted.certifications)), JSON.stringify(mergeArray(product.standards_json, extracted.standards)), JSON.stringify(mergedSpecs), product.source_page || (extracted.sourcePages.length ? extracted.sourcePages.map((page) => `P${page}`).join(", ") : null), now, product.id);
  }
  db.prepare("insert into audit_logs (id, project_id, actor_email, action, entity_type, entity_id, before_json, after_json, request_id, source_ip, created_at) values (?, null, ?, ?, ?, ?, null, ?, ?, null, ?)").run(crypto.randomUUID(), "local-catalog-import", "catalog_folder.content_enrichment", "catalogProducts", "batch", JSON.stringify(result), crypto.randomUUID(), now);
  db.exec("commit");
} catch (error) { db.exec("rollback"); throw error; }
const output = { ...result, backupPath, databasePath: dbPath };
fs.writeFileSync(path.join(root, "work", "catalog-content-enrichment-result.json"), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
