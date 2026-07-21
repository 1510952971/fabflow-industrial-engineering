import { and, desc, eq, gte, inArray, like, lt, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogProducts, productApplications, productVariants } from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { authorize } from "@/lib/auth";
import { matchCatalog, parseJsonArray, type CatalogRequirement } from "@/lib/catalog-selection-engine";

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;
const MAX_MATCH_CANDIDATES = 2_000;

type Cursor = { updatedAt: string; id: string };

function encodeCursor(row: Cursor) {
  return btoa(JSON.stringify(row)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as Cursor;
    return parsed.updatedAt && parsed.id ? parsed : null;
  } catch { throw new ApiError(400, "分页游标无效", "INVALID_CURSOR"); }
}

const normalized = (value: string) => value.trim().toLowerCase().replace(/[\s_\-/]+/g, "");
const facetExists = (type: string, value: string) => sql`EXISTS (
  SELECT 1 FROM catalog_product_facets f
  WHERE f.product_id = ${catalogProducts.id} AND f.facet_type = ${type} AND f.normalized_value = ${normalized(value)}
)`;

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "equipment:read");
    const url = new URL(request.url);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));
    const cursor = decodeCursor(url.searchParams.get("cursor"));
    const categoryId = url.searchParams.get("categoryId")?.trim() ?? "";
    const systemCode = url.searchParams.get("systemCode")?.trim() ?? "";
    const status = url.searchParams.get("status")?.trim() ?? "";
    const q = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const conditions = [ne(catalogProducts.status, "archived")];
    if (categoryId && categoryId !== "all") conditions.push(eq(catalogProducts.categoryId, categoryId));
    if (systemCode && systemCode !== "all") conditions.push(facetExists("system", systemCode));
    if (status && status !== "all") conditions.push(eq(catalogProducts.status, status));
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(or(
        like(catalogProducts.productCode, pattern), like(catalogProducts.model, pattern),
        like(catalogProducts.brand, pattern), like(catalogProducts.productName, pattern),
      )!);
    }
    if (cursor) conditions.push(or(
      lt(catalogProducts.updatedAt, cursor.updatedAt),
      and(eq(catalogProducts.updatedAt, cursor.updatedAt), lt(catalogProducts.id, cursor.id)),
    )!);
    const rows = await getDb().select().from(catalogProducts).where(and(...conditions))
      .orderBy(desc(catalogProducts.updatedAt), desc(catalogProducts.id)).limit(limit + 1);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);
    const ids = items.map((item) => item.id);
    const [variants, applications] = ids.length ? await Promise.all([
      getDb().select().from(productVariants).where(inArray(productVariants.productId, ids)),
      getDb().select().from(productApplications).where(inArray(productApplications.productId, ids)),
    ]) : [[], []];
    return Response.json({ items, variants, applications, nextCursor: hasMore && last ? encodeCursor({ updatedAt: last.updatedAt, id: last.id }) : null, pageSize: items.length, principal });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await authorize(request, "equipment:read");
    const body = await request.json() as { action?: string; requirement?: CatalogRequirement };
    if (body.action !== "match" || !body.requirement) throw new ApiError(400, "选型请求无效", "INVALID_INPUT");
    const requirement = body.requirement;
    const conditions = [ne(catalogProducts.status, "archived"), ne(catalogProducts.status, "rejected")];
    if (requirement.categoryId) conditions.push(eq(catalogProducts.categoryId, requirement.categoryId));
    if (requirement.designPressureMpa != null) {
      conditions.push(gte(catalogProducts.maxPressureMpa, requirement.designPressureMpa));
      conditions.push(or(lte(catalogProducts.minPressureMpa, requirement.designPressureMpa), sql`${catalogProducts.minPressureMpa} IS NULL`)!);
    }
    if (requirement.designTemperatureC != null) {
      conditions.push(gte(catalogProducts.maxTemperatureC, requirement.designTemperatureC));
      conditions.push(or(lte(catalogProducts.minTemperatureC, requirement.designTemperatureC), sql`${catalogProducts.minTemperatureC} IS NULL`)!);
    }
    if (requirement.systemCode) conditions.push(facetExists("system", requirement.systemCode));
    if (requirement.medium) conditions.push(facetExists("medium", requirement.medium));
    const brands = parseJsonArray(requirement.requiredBrandsJson);
    if (brands.length === 1) conditions.push(eq(catalogProducts.brand, brands[0]));
    const hasIndexedSelector = Boolean(requirement.categoryId || requirement.systemCode || requirement.medium || requirement.designPressureMpa != null || requirement.designTemperatureC != null || brands.length);
    if (!hasIndexedSelector) throw new ApiError(400, "百万级全库选型至少需要分类、系统、介质、品牌、压力或温度中的一项", "INDEXED_FILTER_REQUIRED");
    const candidates = await getDb().select().from(catalogProducts).where(and(...conditions)).limit(MAX_MATCH_CANDIDATES + 1);
    if (candidates.length > MAX_MATCH_CANDIDATES) throw new ApiError(409, "候选产品超过 2000 条，请增加分类或工况条件后重试", "MATCH_SCOPE_TOO_BROAD");
    const matches = matchCatalog(requirement, candidates).slice(0, 100);
    const byId = new Map(candidates.map((item) => [item.id, item]));
    return Response.json({ matches, products: matches.map((item) => byId.get(item.productId)).filter(Boolean), candidateCount: candidates.length, truncated: false });
  } catch (error) { return errorResponse(error); }
}
