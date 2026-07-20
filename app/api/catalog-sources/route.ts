import { and, count, desc, eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogSourceCandidates, catalogSourceDocuments } from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, authorize, type Principal } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import type { CatalogSourceManifestEntry } from "@/lib/catalog-source-ingestion";

function requireCatalogAdmin(principal: Principal) {
  assertAuthenticated(principal);
  if (!principal.roles.includes("platform_admin")) throw new ApiError(403, "只有平台管理员可以导入全局型录资料", "GLOBAL_SCOPE_REQUIRED");
}
async function stableId(prefix: string, value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return prefix + "-" + hex.slice(0, 32);
}
function asEntry(value: unknown): CatalogSourceManifestEntry {
  if (!value || typeof value !== "object") throw new ApiError(400, "资料清单项格式无效", "INVALID_ENTRY");
  const input = value as Record<string, unknown>;
  const text = (key: string) => String(input[key] ?? "").trim();
  const sizeBytes = Number(input.sizeBytes);
  if (!text("sourceKey") || !text("relativePath") || !text("fileName") || !text("extension") || !text("documentType") || !text("parserType")) throw new ApiError(400, "资料清单缺少来源键、路径或分类", "INVALID_ENTRY");
  return {
    sourceKey: text("sourceKey"), sourceRoot: text("sourceRoot"), relativePath: text("relativePath"), fileName: text("fileName"), extension: text("extension"),
    contentType: text("contentType") || "application/octet-stream", sizeBytes: Number.isFinite(sizeBytes) ? Math.max(0, Math.round(sizeBytes)) : 0,
    modifiedAt: text("modifiedAt") || undefined, documentType: text("documentType") as CatalogSourceManifestEntry["documentType"],
    parserType: text("parserType") as CatalogSourceManifestEntry["parserType"], manufacturerHint: text("manufacturerHint"),
    productFamilyHint: text("productFamilyHint"), modelHint: text("modelHint"), sourceRevision: text("sourceRevision") || undefined,
  };
}
function candidateFrom(entry: CatalogSourceManifestEntry, sourceDocumentId: string, actor: string) {
  if (!entry.modelHint && entry.documentType === "manufacturer_catalog") return null;
  const candidateKey = entry.sourceKey + "|" + (entry.modelHint || entry.fileName);
  return {
    id: crypto.randomUUID(), sourceDocumentId, candidateKey, productName: entry.productFamilyHint || entry.fileName.replace(/\\.[^.]+$/, ""),
    manufacturer: entry.manufacturerHint, brand: entry.manufacturerHint, model: entry.modelHint, categoryHint: entry.productFamilyHint,
    systemsJson: "[]", parametersJson: JSON.stringify({ sourceFile: entry.relativePath, documentType: entry.documentType }),
    confidence: entry.modelHint ? 55 : 20, status: "needs_review", createdBy: actor,
  };
}
export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "data:read");
    if (!principal.authenticated || !principal.roles.includes("platform_admin")) throw new ApiError(403, "型录资料清单仅对平台管理员开放", "GLOBAL_SCOPE_REQUIRED");
    const url = new URL(request.url); const db = getDb(); const q = url.searchParams.get("q")?.trim() ?? "";
    const type = url.searchParams.get("documentType")?.trim() ?? ""; const extractionStatus = url.searchParams.get("extractionStatus")?.trim() ?? "";
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
    const conditions = [];
    if (q) conditions.push(or(like(catalogSourceDocuments.fileName, "%" + q + "%"), like(catalogSourceDocuments.relativePath, "%" + q + "%"), like(catalogSourceDocuments.manufacturerHint, "%" + q + "%"), like(catalogSourceDocuments.modelHint, "%" + q + "%")));
    if (type) conditions.push(eq(catalogSourceDocuments.documentType, type));
    if (extractionStatus) conditions.push(eq(catalogSourceDocuments.extractionStatus, extractionStatus));
    const documents = await db.select().from(catalogSourceDocuments).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(catalogSourceDocuments.updatedAt)).limit(limit);
    const candidates = await db.select().from(catalogSourceCandidates).orderBy(desc(catalogSourceCandidates.updatedAt)).limit(Math.min(limit, 100));
    const [total] = await db.select({ value: count() }).from(catalogSourceDocuments);
    const [queued] = await db.select({ value: count() }).from(catalogSourceDocuments).where(eq(catalogSourceDocuments.extractionStatus, "queued"));
    const [review] = await db.select({ value: count() }).from(catalogSourceCandidates).where(eq(catalogSourceCandidates.status, "needs_review"));
    return Response.json({ documents, candidates, stats: { total: Number(total?.value ?? 0), queued: Number(queued?.value ?? 0), candidatesNeedsReview: Number(review?.value ?? 0) } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "data:write"); requireCatalogAdmin(principal);
    const body = await request.json() as { action?: string; entries?: unknown[] };
    if (body.action !== "register_manifest") throw new ApiError(400, "只支持注册资料清单", "INVALID_ACTION");
    if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > 500) throw new ApiError(400, "每批必须包含 1-500 份资料", "INVALID_BATCH");
    const db = getDb(); const created: string[] = []; const candidateIds: string[] = []; const errors: Array<{ sourceKey: string; message: string }> = [];
    for (const raw of body.entries) {
      let entry: CatalogSourceManifestEntry;
      try { entry = asEntry(raw); } catch (error) { errors.push({ sourceKey: "", message: error instanceof Error ? error.message : String(error) }); continue; }
      try {
        const metadataValues = {
          sourceKey: entry.sourceKey, sourceRoot: entry.sourceRoot, relativePath: entry.relativePath, fileName: entry.fileName, extension: entry.extension,
          contentType: entry.contentType, sizeBytes: entry.sizeBytes, modifiedAt: entry.modifiedAt ?? null, documentType: entry.documentType, parserType: entry.parserType,
          manufacturerHint: entry.manufacturerHint, productFamilyHint: entry.productFamilyHint, modelHint: entry.modelHint, sourceRevision: entry.sourceRevision ?? "",
        };
        const sourceId = await stableId("src", entry.sourceKey);
        await db.insert(catalogSourceDocuments).values({
          id: sourceId,
          ...metadataValues,
          extractionStatus: "queued",
          extractedJson: "{}",
          errorMessage: null,
          createdBy: principal.email,
        }).onConflictDoUpdate({
          target: catalogSourceDocuments.sourceKey,
          // Re-scanning the same file only refreshes source metadata. Keep extraction and
          // review state so an idempotent manifest import never destroys completed work.
          set: { ...metadataValues, updatedAt: new Date().toISOString() },
        });
        created.push(sourceId);
        const candidate = candidateFrom(entry, sourceId, principal.email);
        if (candidate) {
          candidate.id = await stableId("cand", candidate.candidateKey);
          await db.insert(catalogSourceCandidates).values(candidate).onConflictDoNothing({ target: catalogSourceCandidates.candidateKey });
          candidateIds.push(candidate.id);
        }
      } catch (error) { errors.push({ sourceKey: entry.sourceKey, message: error instanceof Error ? error.message : String(error) }); }
    }
    await writeAudit(request, principal, { projectId: null, action: "catalog_source.register_manifest", entityType: "catalogSourceDocuments", entityId: "batch", after: { registered: created.length, candidates: candidateIds.length, errors: errors.length } });
    return Response.json({ registered: created.length, candidates: candidateIds.length, errors }, { status: errors.length && !created.length ? 400 : 201 });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const principal = await authorize(request, "data:write"); requireCatalogAdmin(principal);
    const body = await request.json() as { candidateId?: string; status?: string; reviewNote?: string; extractionStatus?: string; sourceDocumentId?: string };
    const db = getDb();
    if (body.candidateId) {
      const [before] = await db.select().from(catalogSourceCandidates).where(eq(catalogSourceCandidates.id, body.candidateId)).limit(1);
      if (!before) throw new ApiError(404, "产品候选不存在", "NOT_FOUND");
      const allowed = new Set(["needs_review", "accepted", "rejected", "promoted"]);
      if (!body.status || !allowed.has(body.status)) throw new ApiError(400, "候选状态无效", "INVALID_STATUS");
      const afterValues = { status: body.status, reviewNote: String(body.reviewNote ?? "").slice(0, 2000), updatedAt: new Date().toISOString() };
      await db.update(catalogSourceCandidates).set(afterValues).where(eq(catalogSourceCandidates.id, before.id));
      await writeAudit(request, principal, { projectId: null, action: "catalog_source_candidate.review", entityType: "catalogSourceCandidates", entityId: before.id, before, after: afterValues });
      return Response.json({ candidate: { ...before, ...afterValues } });
    }
    if (body.sourceDocumentId) {
      const [before] = await db.select().from(catalogSourceDocuments).where(eq(catalogSourceDocuments.id, body.sourceDocumentId)).limit(1);
      if (!before) throw new ApiError(404, "资料源不存在", "NOT_FOUND");
      const allowed = new Set(["queued", "processing", "needs_review", "completed", "failed", "unsupported"]);
      if (!body.extractionStatus || !allowed.has(body.extractionStatus)) throw new ApiError(400, "解析状态无效", "INVALID_STATUS");
      const afterValues = { extractionStatus: body.extractionStatus, updatedAt: new Date().toISOString() };
      await db.update(catalogSourceDocuments).set(afterValues).where(eq(catalogSourceDocuments.id, before.id));
      await writeAudit(request, principal, { projectId: null, action: "catalog_source.extraction_status", entityType: "catalogSourceDocuments", entityId: before.id, before, after: afterValues });
      return Response.json({ document: { ...before, ...afterValues } });
    }
    throw new ApiError(400, "缺少候选或资料源 ID", "INVALID_INPUT");
  } catch (error) { return errorResponse(error); }
}
