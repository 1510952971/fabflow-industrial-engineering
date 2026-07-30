import { and, desc, eq, gte, inArray, like, lt, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogProducts, productApplications, productParameterDefinitions, productVariants } from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, authorize } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { matchCatalog, parseJsonArray, type CatalogRequirement } from "@/lib/catalog-selection-engine";
import { validateProductSpecifications, type ProductParameterDefinition } from "@/lib/product-catalog";

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
    const principal = await authorize(request, "equipment:read");
    const body = await request.json() as { action?: string; requirement?: CatalogRequirement; ids?: string[]; status?: string };
    if (body.action === "review") {
      assertAuthenticated(principal);
      if (!principal.roles.includes("platform_admin")) throw new ApiError(403, "只有平台管理员可以审核全局产品型录", "GLOBAL_SCOPE_REQUIRED");
      const ids = [...new Set((body.ids ?? []).map(String).filter(Boolean))];
      if (!ids.length || ids.length > 100) throw new ApiError(400, "每次请选择 1-100 个产品", "INVALID_BATCH");
      if (body.status !== "pending_review" && body.status !== "approved") throw new ApiError(400, "审核状态无效", "INVALID_STATUS");
      const db = getDb();
      const rows = await db.select().from(catalogProducts).where(inArray(catalogProducts.id, ids));
      const missingIds = ids.filter((id) => !rows.some((row) => row.id === id));
      const categoryIds = [...new Set(rows.map((row) => row.categoryId))];
      const definitions = categoryIds.length ? await db.select().from(productParameterDefinitions).where(inArray(productParameterDefinitions.categoryId, categoryIds)) : [];
      const updated = []; const failures: Array<{ id: string; productCode: string; issues: string[] }> = missingIds.map((id) => ({ id, productCode: id, issues: ["产品不存在或已被删除"] }));
      for (const row of rows) {
        const issues = reviewIssues(row, definitions as ProductParameterDefinition[], body.status);
        if (body.status === "approved" && row.status !== "pending_review") issues.unshift("产品必须先进入待审核状态");
        if (issues.length) { failures.push({ id: row.id, productCode: row.productCode, issues }); continue; }
        const after = { status: body.status, updatedAt: new Date().toISOString() };
        await db.update(catalogProducts).set(after).where(eq(catalogProducts.id, row.id));
        updated.push({ ...row, ...after });
        await writeAudit(request, principal, { projectId: null, action: `catalog_product.${body.status}`, entityType: "catalogProducts", entityId: row.id, before: { status: row.status }, after });
      }
      return Response.json({ updated, failures }, { status: failures.length && !updated.length ? 409 : 200 });
    }
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

function reviewIssues(row: typeof catalogProducts.$inferSelect, definitions: ProductParameterDefinition[], targetStatus: string) {
  const issues: string[] = [];
  if (!parseJsonArray(row.applicableSystemsJson).length) issues.push("至少选择一个适用系统");
  if (!row.sourceDocument && !row.sourceUrl) issues.push("缺少来源文件或厂家正式链接");
  if (targetStatus === "approved" && row.sourceDocument && !row.sourcePage && !row.sourceUrl) issues.push("缺少来源页码");
  for (const [value, label] of [[row.manufacturer, "制造商"], [row.brand, "品牌"], [row.productCode, "产品编码"], [row.productName, "产品名称"], [row.model, "完整型号"]]) {
    if (!String(value ?? "").trim()) issues.push(`缺少${label}`);
  }
  const result = validateProductSpecifications(row.specificationsJson, definitions.filter((item) => item.categoryId === row.categoryId && item.status !== "archived"));
  issues.push(...result.issues.map((issue) => issue.message));
  return [...new Set(issues)];
}
