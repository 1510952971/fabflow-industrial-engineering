import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const rowsArg = process.argv.find((arg) => arg.startsWith("--rows="));
const rows = Math.max(1_000, Number(rowsArg?.split("=")[1] ?? 1_000_000));
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const dbPath = resolve(outputArg?.slice("--output=".length) || `work/benchmarks/catalog-${rows}.sqlite`);
mkdirSync(dirname(dbPath), { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix, { force: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-131072;
  CREATE TABLE catalog_products (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, brand TEXT NOT NULL, product_code TEXT NOT NULL, product_name TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, max_pressure_mpa REAL, max_temperature_c REAL, specifications_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE UNIQUE INDEX catalog_products_brand_code_uq ON catalog_products(brand, product_code);
  CREATE INDEX catalog_products_browse_idx ON catalog_products(category_id, updated_at, id, status);
  CREATE INDEX catalog_products_updated_idx ON catalog_products(updated_at, id, status);
  CREATE INDEX catalog_products_pressure_idx ON catalog_products(status, category_id, max_pressure_mpa, id);
  CREATE INDEX catalog_products_temperature_idx ON catalog_products(status, category_id, max_temperature_c, id);
  CREATE TABLE catalog_product_facets (product_id TEXT NOT NULL, facet_type TEXT NOT NULL, normalized_value TEXT NOT NULL, display_value TEXT NOT NULL, PRIMARY KEY(product_id, facet_type, normalized_value));
  CREATE INDEX catalog_product_facets_lookup_idx ON catalog_product_facets(facet_type, normalized_value, product_id);
`);

const insertProduct = db.prepare(`INSERT INTO catalog_products VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertFacet = db.prepare(`INSERT INTO catalog_product_facets VALUES (?, ?, ?, ?)`);
const systems = ["VMB", "BSGS", "CDS", "UPW", "PCW", "CDA", "EXH", "FIRE", "HVAC", "BMS"];
const started = performance.now();
for (let base = 0; base < rows; base += 10_000) {
  db.exec("BEGIN IMMEDIATE");
  const end = Math.min(rows, base + 10_000);
  for (let i = base; i < end; i += 1) {
    const id = `prod-${String(i).padStart(9, "0")}`;
    const category = `cat-${String(i % 32).padStart(2, "0")}`;
    const brand = `Brand-${String(i % 500).padStart(3, "0")}`;
    const system = systems[i % systems.length];
    insertProduct.run(id, category, brand, `P-${String(i).padStart(9, "0")}`, `FAB product ${i}`, `M-${i}`, i % 17 ? "approved" : "draft", 0.5 + (i % 100) / 10, 80 + (i % 220), JSON.stringify({ cv: i % 1000, size: `${(i % 12) + 1}/4 in` }), `2026-07-${String(1 + (i % 20)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00:00.000Z`);
    insertFacet.run(id, "system", system.toLowerCase(), system);
    insertFacet.run(id, "medium", `medium${i % 50}`, `MEDIUM-${i % 50}`);
  }
  db.exec("COMMIT");
  if (end % 100_000 === 0 || end === rows) process.stdout.write(`Inserted ${end.toLocaleString()} / ${rows.toLocaleString()}\n`);
}
db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
const insertMs = performance.now() - started;
const cursorQuery = db.prepare(`SELECT id, updated_at FROM catalog_products WHERE status <> 'archived' AND category_id = ? AND (updated_at < ? OR (updated_at = ? AND id < ?)) ORDER BY updated_at DESC, id DESC LIMIT 61`);
const filterQuery = db.prepare(`SELECT p.id FROM catalog_products p WHERE p.status IN ('approved','conditional') AND p.category_id = ? AND p.max_pressure_mpa >= ? AND EXISTS (SELECT 1 FROM catalog_product_facets f WHERE f.product_id=p.id AND f.facet_type='system' AND f.normalized_value=?) LIMIT 2001`);
function samples(statement, argsFactory, count = 200) { const values = []; for (let i = 0; i < count; i += 1) { const before = performance.now(); statement.all(...argsFactory(i)); values.push(performance.now() - before); } values.sort((a, b) => a - b); return { p50Ms: values[Math.floor(values.length * .5)], p95Ms: values[Math.floor(values.length * .95)], maxMs: values.at(-1) }; }
const cursorLatency = samples(cursorQuery, (i) => [`cat-${String(i % 32).padStart(2, "0")}`, "2026-07-21T23:59:59.999Z", "2026-07-21T23:59:59.999Z", "zzzz"]);
const filterLatency = samples(filterQuery, (i) => [`cat-${String(i % 32).padStart(2, "0")}`, 2 + (i % 20) / 10, systems[i % systems.length].toLowerCase()]);
const productCount = db.prepare("SELECT count(*) AS count FROM catalog_products").get().count;
const facetCount = db.prepare("SELECT count(*) AS count FROM catalog_product_facets").get().count;
const queryPlan = db.prepare("EXPLAIN QUERY PLAN SELECT id FROM catalog_products WHERE status='approved' AND category_id='cat-01' ORDER BY updated_at DESC,id DESC LIMIT 60").all();
db.close();
const result = { generatedAt: new Date().toISOString(), rowsRequested: rows, productCount, facetCount, totalIndexedRows: Number(productCount) + Number(facetCount), insertSeconds: insertMs / 1000, productsPerSecond: rows / (insertMs / 1000), databaseBytes: statSync(dbPath).size, databaseMiB: statSync(dbPath).size / 1024 / 1024, cursorLatency, filterLatency, peakRssMiB: process.memoryUsage().rss / 1024 / 1024, queryPlan, passed: Number(productCount) === rows && cursorLatency.p95Ms < 250 && filterLatency.p95Ms < 250 };
const reportPath = dbPath.replace(/\.sqlite$/, ".report.json");
writeFileSync(reportPath, JSON.stringify(result, null, 2));
process.stdout.write(`${JSON.stringify(result, null, 2)}\nReport: ${reportPath}\nDatabase: ${dbPath}\n`);
if (!result.passed) process.exitCode = 1;
