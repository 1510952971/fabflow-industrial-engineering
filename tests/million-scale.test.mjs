import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("catalog browsing uses keyset pagination and bounded server-side matching", async () => {
  const [route, selection, page, schema] = await Promise.all([
    readFile(new URL("../app/api/catalog-products/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/catalog-selection/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/product-catalog-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /nextCursor/);
  assert.match(route, /MAX_MATCH_CANDIDATES = 2_000/);
  assert.match(route, /catalog_product_facets/);
  assert.doesNotMatch(selection, /select\(\)\.from\(catalogProducts\);/);
  assert.match(selection, /limit\(2001\)/);
  assert.match(page, /loadProducts\(false, nextCursor\)/);
  assert.match(schema, /catalog_products_browse_idx/);
  assert.match(schema, /catalog_product_facets_lookup_idx/);
});

test("large binaries stay in R2 and editor checkpoints stay bounded", async () => {
  const [filesRoute, draftsRoute, guide] = await Promise.all([
    readFile(new URL("../app/api/files/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/drafts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/MILLION_SCALE_ARCHITECTURE.md", import.meta.url), "utf8"),
  ]);
  assert.match(filesRoute, /env\.FILES\.put/);
  assert.match(draftsRoute, /MAX_DRAFT_BYTES = 512 \* 1024/);
  assert.match(guide, /1,000,000/);
  assert.match(guide, /R2/);
  assert.match(guide, /游标/);
});
