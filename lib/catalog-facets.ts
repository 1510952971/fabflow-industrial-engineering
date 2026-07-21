import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogProductFacets } from "@/db/schema";
import { parseJsonArray } from "./catalog-selection-engine";

const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_\-/]+/g, "");

export async function syncCatalogProductFacets(product: Record<string, unknown>) {
  const productId = String(product.id ?? "");
  if (!productId) return;
  const groups: Array<[string, unknown]> = [
    ["system", product.applicableSystemsJson], ["medium", product.mediaJson],
    ["material", product.wettedMaterialsJson], ["certification", product.certificationsJson],
    ["standard", product.standardsJson],
  ];
  const values = groups.flatMap(([facetType, raw]) => parseJsonArray(raw).map((displayValue) => ({
    productId, facetType, normalizedValue: normalize(displayValue), displayValue,
  }))).filter((item, index, all) => item.normalizedValue && all.findIndex((candidate) => candidate.facetType === item.facetType && candidate.normalizedValue === item.normalizedValue) === index);
  const db = getDb();
  await db.delete(catalogProductFacets).where(eq(catalogProductFacets.productId, productId));
  for (let offset = 0; offset < values.length; offset += 100) {
    const batch = values.slice(offset, offset + 100);
    if (batch.length) await db.insert(catalogProductFacets).values(batch);
  }
}
