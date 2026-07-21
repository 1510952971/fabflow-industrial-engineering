import { and, desc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  attachments,
  bomItems,
  catalogProducts,
  catalogSelectionResults,
  catalogSelectionRuns,
  productVariants,
  projectProductRequirements,
  systems,
  technicalSpecExtractions,
} from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { assertAuthenticated, assertProjectAccess, authorize } from "@/lib/auth";
import { matchCatalog } from "@/lib/catalog-selection-engine";

async function loadRequirement(projectId: string, requirementId: string) {
  const [requirement] = await getDb().select().from(projectProductRequirements).where(and(
    eq(projectProductRequirements.id, requirementId),
    eq(projectProductRequirements.projectId, projectId),
  )).limit(1);
  if (!requirement) throw new ApiError(404, "项目选型要求不存在", "REQUIREMENT_NOT_FOUND");
  return requirement;
}

async function loadResultRows(runId: string) {
  const db = getDb();
  const results = await db.select().from(catalogSelectionResults).where(eq(catalogSelectionResults.runId, runId)).orderBy(desc(catalogSelectionResults.score));
  const productIds = results.map((item) => item.productId);
  const products = productIds.length ? await db.select().from(catalogProducts).where(inArray(catalogProducts.id, productIds)) : [];
  const productMap = new Map(products.map((item) => [item.id, item]));
  return results.map((item) => ({ ...item, checks: JSON.parse(item.checksJson), product: productMap.get(item.productId) ?? null }));
}

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "equipment:read");
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() ?? "";
    const requirementId = url.searchParams.get("requirementId")?.trim() ?? "";
    if (!projectId || !requirementId) throw new ApiError(400, "项目和选型要求不能为空", "INVALID_INPUT");
    assertProjectAccess(principal, projectId);
    await loadRequirement(projectId, requirementId);
    const [run] = await getDb().select().from(catalogSelectionRuns).where(and(
      eq(catalogSelectionRuns.projectId, projectId),
      eq(catalogSelectionRuns.requirementId, requirementId),
    )).orderBy(desc(catalogSelectionRuns.createdAt)).limit(1);
    return Response.json({ run: run ?? null, results: run ? await loadResultRows(run.id) : [] });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "equipment:validate");
    assertAuthenticated(principal);
    const body = await request.json() as { action?: string; projectId?: string; requirementId?: string; runId?: string; productId?: string; variantId?: string; quantity?: number };
    const projectId = body.projectId?.trim() ?? "";
    const requirementId = body.requirementId?.trim() ?? "";
    if (!projectId || !requirementId) throw new ApiError(400, "项目和选型要求不能为空", "INVALID_INPUT");
    assertProjectAccess(principal, projectId, true);
    const requirement = await loadRequirement(projectId, requirementId);
    const db = getDb();

    if (body.action === "match") {
      if (!requirement.attachmentId) throw new ApiError(400, "请先上传并关联项目技术规格书", "TECHNICAL_SPEC_REQUIRED");
      const [sourceFile] = await db.select().from(attachments).where(and(
        eq(attachments.id, requirement.attachmentId),
        eq(attachments.projectId, projectId),
      )).limit(1);
      if (!sourceFile || sourceFile.status === "archived") throw new ApiError(400, "关联的技术规格书不存在或已归档", "TECHNICAL_SPEC_NOT_FOUND");

      const [extraction] = await db.select().from(technicalSpecExtractions).where(and(eq(technicalSpecExtractions.projectId, projectId), eq(technicalSpecExtractions.requirementId, requirementId))).orderBy(desc(technicalSpecExtractions.createdAt)).limit(1);
      if (!extraction || extraction.status !== "confirmed") throw new ApiError(409, "请先完成技术规格书自动提取结果的人工确认", "TECHNICAL_SPEC_CONFIRMATION_REQUIRED");
      const candidateConditions = [
        eq(catalogProducts.categoryId, requirement.categoryId),
        ne(catalogProducts.status, "archived"), ne(catalogProducts.status, "rejected"),
      ];
      if (requirement.designPressureMpa != null) {
        candidateConditions.push(gte(catalogProducts.maxPressureMpa, requirement.designPressureMpa));
        candidateConditions.push(or(lte(catalogProducts.minPressureMpa, requirement.designPressureMpa), sql`${catalogProducts.minPressureMpa} IS NULL`)!);
      }
      if (requirement.designTemperatureC != null) {
        candidateConditions.push(gte(catalogProducts.maxTemperatureC, requirement.designTemperatureC));
        candidateConditions.push(or(lte(catalogProducts.minTemperatureC, requirement.designTemperatureC), sql`${catalogProducts.minTemperatureC} IS NULL`)!);
      }
      if (requirement.systemCode) candidateConditions.push(sql`EXISTS (
        SELECT 1 FROM catalog_product_facets f WHERE f.product_id = ${catalogProducts.id}
        AND f.facet_type = 'system' AND f.normalized_value = ${requirement.systemCode.trim().toLowerCase().replaceAll(" ", "").replaceAll("_", "").replaceAll("-", "").replaceAll("/", "")}
      )`);
      const products = await db.select().from(catalogProducts).where(and(...candidateConditions)).limit(2001);
      if (products.length > 2000) throw new ApiError(409, "Too many candidates; add system, medium or operating conditions", "MATCH_SCOPE_TOO_BROAD");
      const matches = matchCatalog(requirement, products);
      const runId = crypto.randomUUID();
      const usable = matches.filter((item) => item.status !== "blocked").length;
      await db.insert(catalogSelectionRuns).values({
        id: runId,
        projectId,
        requirementId,
        status: usable ? "completed" : "blocked",
        matchedCount: usable,
        blockedCount: matches.length - usable,
        submittedBy: principal.email,
        inputJson: JSON.stringify({ requirement, attachment: { id: sourceFile.id, fileName: sourceFile.fileName, sha256: sourceFile.sha256, version: sourceFile.version } }),
      });
      for (const item of matches) await db.insert(catalogSelectionResults).values({
        id: crypto.randomUUID(), runId, productId: item.productId, score: item.score, status: item.status, checksJson: JSON.stringify(item.checks),
      });
      await db.update(projectProductRequirements).set({ selectionStatus: usable ? "matched" : "blocked", updatedAt: new Date().toISOString() }).where(eq(projectProductRequirements.id, requirementId));
      await writeAudit(request, principal, {
        projectId, action: "catalog_selection.match", entityType: "projectProductRequirements", entityId: requirementId,
        after: { runId, sourceAttachmentId: sourceFile.id, matchedCount: usable, blockedCount: matches.length - usable },
      });
      return Response.json({ run: { id: runId, status: usable ? "completed" : "blocked", matchedCount: usable, blockedCount: matches.length - usable }, results: await loadResultRows(runId) }, { status: 201 });
    }

    if (body.action === "select") {
      if (!body.runId || !body.productId) throw new ApiError(400, "匹配运行和产品不能为空", "INVALID_INPUT");
      const [run] = await db.select().from(catalogSelectionRuns).where(and(
        eq(catalogSelectionRuns.id, body.runId), eq(catalogSelectionRuns.projectId, projectId), eq(catalogSelectionRuns.requirementId, requirementId),
      )).limit(1);
      if (!run) throw new ApiError(404, "匹配运行不存在", "RUN_NOT_FOUND");
      const [result] = await db.select().from(catalogSelectionResults).where(and(
        eq(catalogSelectionResults.runId, run.id), eq(catalogSelectionResults.productId, body.productId),
      )).limit(1);
      if (!result) throw new ApiError(404, "匹配结果不存在", "RESULT_NOT_FOUND");
      if (result.status === "blocked") throw new ApiError(409, "该产品存在致命不符合项，不能选入项目", "SELECTION_BLOCKED");
      const [product] = await db.select().from(catalogProducts).where(eq(catalogProducts.id, body.productId)).limit(1);
      if (!product) throw new ApiError(404, "全局型录产品不存在", "PRODUCT_NOT_FOUND");
      const variant = body.variantId
        ? (await db.select().from(productVariants).where(and(eq(productVariants.id, body.variantId), eq(productVariants.productId, product.id))).limit(1))[0]
        : (await db.select().from(productVariants).where(and(eq(productVariants.productId, product.id), eq(productVariants.status, "active"))).limit(1))[0];
      const [projectSystem] = await db.select().from(systems).where(and(eq(systems.projectId, projectId), eq(systems.code, requirement.systemCode))).limit(1);
      if (!projectSystem) throw new ApiError(409, `项目系统主数据中不存在 ${requirement.systemCode}，请先建立系统`, "PROJECT_SYSTEM_REQUIRED");
      const sourceId = `catalog-requirement:${requirementId}`;
      const [existingBom] = await db.select().from(bomItems).where(and(eq(bomItems.projectId, projectId), eq(bomItems.sourceType, "catalog_selection"), eq(bomItems.sourceId, sourceId))).limit(1);
      const quantity = Number.isFinite(Number(body.quantity)) && Number(body.quantity) > 0 ? Number(body.quantity) : 1;
      const bomValues = {
        systemId: projectSystem.id,
        itemCode: variant?.sku || product.productCode,
        itemName: product.productName,
        specification: [product.brand, product.model, product.nominalSize, product.connectionStandard, JSON.parse(product.wettedMaterialsJson || "[]").join("、")].filter(Boolean).join(" · "),
        quantity,
        unit: "件",
        unitPriceCny: variant?.unitPriceCny ?? 0,
        wastePct: 5,
        sourceType: "catalog_selection",
        sourceId,
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
      let bomId = existingBom?.id;
      if (existingBom) await db.update(bomItems).set(bomValues).where(eq(bomItems.id, existingBom.id));
      else {
        bomId = crypto.randomUUID();
        await db.insert(bomItems).values({ id: bomId, projectId, ...bomValues });
      }
      const now = new Date().toISOString();
      await db.update(projectProductRequirements).set({
        selectedProductId: product.id,
        selectedVariantId: variant?.id ?? null,
        selectionStatus: "selected",
        status: "selected",
        selectedBy: principal.email,
        selectedAt: now,
        updatedAt: now,
      }).where(eq(projectProductRequirements.id, requirementId));
      await writeAudit(request, principal, {
        projectId, action: "catalog_selection.select", entityType: "projectProductRequirements", entityId: requirementId,
        before: { selectedProductId: requirement.selectedProductId, selectionStatus: requirement.selectionStatus },
        after: { selectedProductId: product.id, selectedVariantId: variant?.id ?? null, runId: run.id, resultStatus: result.status, bomId },
      });
      return Response.json({ selected: true, product, variant: variant ?? null, bomId });
    }

    throw new ApiError(400, "不支持的选型动作", "INVALID_ACTION");
  } catch (error) { return errorResponse(error); }
}