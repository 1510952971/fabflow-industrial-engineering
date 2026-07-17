import { and, count, desc, eq, ne } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { attachments } from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize, getPrincipal, hasPermission, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const allowedEntities = new Set([
  "project", "system", "tag", "interface", "material", "equipment_model", "selection_run",
  "test_pack", "punch", "approval", "projects", "systems", "tags", "interfaces", "materials",
  "materialCompatibility", "equipmentFactories", "equipmentModels", "equipmentComponents", "equipmentPorts",
  "technicalRules", "brandRules", "bomItems", "purchaseOrders", "testPacks", "punchItems",
  "catalogProducts", "projectProductRequirements",
]);

export async function GET(request: Request) {
  try {
    const principal = await getPrincipal(request);
    const url = new URL(request.url);
    const downloadId = url.searchParams.get("download");

    if (downloadId) {
      const [file] = await getDb().select().from(attachments).where(eq(attachments.id, downloadId)).limit(1);
      if (!file) throw new ApiError(404, "Attachment not found", "NOT_FOUND");
      const publicCatalogImage = file.projectId === PUBLIC_DEMO_PROJECT_ID && file.entityType === "catalogProducts" && file.category === "product_image";
      if (!publicCatalogImage && !hasPermission(principal, "files:read")) throw new ApiError(403, "File read permission required", "FORBIDDEN");
      assertProjectAccess(principal, file.projectId);
      if (file.status === "archived") throw new ApiError(410, "Attachment archived", "FILE_ARCHIVED");
      if (!env.FILES) throw new ApiError(503, "R2 file storage is not bound", "R2_UNAVAILABLE");
      const object = await env.FILES.get(file.objectKey);
      if (!object) throw new ApiError(404, "R2 object not found", "FILE_NOT_FOUND");
      const inline = publicCatalogImage && url.searchParams.get("inline") === "1" && file.contentType.startsWith("image/");
      return new Response(object.body, {
        headers: {
          "Content-Type": file.contentType,
          "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
          "Cache-Control": inline ? "public, max-age=300" : "private, no-store",
          ETag: file.sha256,
        },
      });
    }

    const projectId = url.searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    const publicCatalogImages = projectId === PUBLIC_DEMO_PROJECT_ID && entityType === "catalogProducts";
    if (!hasPermission(principal, "files:read") && !publicCatalogImages) throw new ApiError(403, "File read permission required", "FORBIDDEN");
    assertProjectAccess(principal, projectId);
    const conditions = [eq(attachments.projectId, projectId)];
    if (publicCatalogImages) conditions.push(eq(attachments.entityType, "catalogProducts"), eq(attachments.category, "product_image"));
    else if (entityType) conditions.push(eq(attachments.entityType, entityType));
    if (entityId) conditions.push(eq(attachments.entityId, entityId));
    const category = url.searchParams.get("category");
    if (!publicCatalogImages && category) conditions.push(eq(attachments.category, category));
    if (url.searchParams.get("includeArchived") !== "1" || !principal.roles.includes("platform_admin")) conditions.push(ne(attachments.status, "archived"));
    const rows = await getDb().select().from(attachments).where(and(...conditions)).orderBy(desc(attachments.createdAt)).limit(100);
    const responseRows = publicCatalogImages ? rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "objectKey"))) : rows;
    return Response.json({ files: responseRows });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "files:write");
    assertAuthenticated(principal);
    const form = await request.formData();
    const file = form.get("file");
    const projectId = String(form.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID);
    assertProjectAccess(principal, projectId, true);
    const entityType = String(form.get("entityType") ?? "");
    const entityId = String(form.get("entityId") ?? "");
    const category = String(form.get("category") ?? "evidence");
    if (!(file instanceof File)) throw new ApiError(400, "必须上传文件", "FILE_REQUIRED");
    if (!allowedEntities.has(entityType) || !entityId) throw new ApiError(400, "附件关联对象无效", "INVALID_ENTITY");
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) throw new ApiError(400, "文件大小必须在 1B–25MB 之间", "FILE_SIZE_INVALID");
    if (!env.FILES) throw new ApiError(503, "R2 文件存储尚未绑定", "R2_UNAVAILABLE");

    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const db = getDb();
    const [{ total }] = await db.select({ total: count() }).from(attachments).where(and(
      eq(attachments.projectId, projectId),
      eq(attachments.entityType, entityType),
      eq(attachments.entityId, entityId),
      eq(attachments.category, category),
    ));
    const version = Number(total) + 1;
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, "_");
    const objectKey = `${projectId}/${entityType}/${entityId}/${category}/v${version}-${crypto.randomUUID()}-${safeName}`;
    await env.FILES.put(objectKey, bytes, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { projectId, entityType, entityId, category, uploadedBy: principal.email, sha256 },
    });
    const row = {
      id: crypto.randomUUID(), projectId, entityType, entityId, category, fileName: file.name, objectKey,
      contentType: file.type || "application/octet-stream", sizeBytes: file.size, sha256, version, uploadedBy: principal.email,
    };
    await db.insert(attachments).values(row);
    await writeAudit(request, principal, {
      projectId, action: "attachment.upload", entityType, entityId,
      after: { attachmentId: row.id, fileName: row.fileName, sha256, version },
    });
    return Response.json({ file: row }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const principal = await authorize(request, "files:write");
    assertAuthenticated(principal);
    const body = await request.json() as { id?: string; action?: string };
    if (!body.id || !["sign", "archive"].includes(body.action ?? "")) throw new ApiError(400, "附件动作无效", "INVALID_INPUT");
    const db = getDb();
    const [before] = await db.select().from(attachments).where(eq(attachments.id, body.id)).limit(1);
    if (!before) throw new ApiError(404, "附件不存在", "NOT_FOUND");
    assertProjectAccess(principal, before.projectId, true);
    const values = body.action === "sign"
      ? { signedBy: principal.email, signedAt: new Date().toISOString(), status: "signed" }
      : { status: "archived" };
    await db.update(attachments).set(values).where(eq(attachments.id, body.id));
    const [after] = await db.select().from(attachments).where(eq(attachments.id, body.id)).limit(1);
    await writeAudit(request, principal, {
      projectId: before.projectId, action: `attachment.${body.action}`, entityType: before.entityType,
      entityId: before.entityId, before, after,
    });
    return Response.json({ file: after });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await authorize(request, "files:write");
    assertAuthenticated(principal);
    const body = await request.json() as { id?: string; hard?: boolean };
    if (!body.id) throw new ApiError(400, "附件 ID 缺失", "INVALID_INPUT");
    const db = getDb();
    const [before] = await db.select().from(attachments).where(eq(attachments.id, body.id)).limit(1);
    if (!before) throw new ApiError(404, "附件不存在", "NOT_FOUND");
    assertProjectAccess(principal, before.projectId, true);
    await db.update(attachments).set({ status: "archived" }).where(eq(attachments.id, body.id));
    if (body.hard && principal.roles.includes("platform_admin") && env.FILES) await env.FILES.delete(before.objectKey);
    await writeAudit(request, principal, {
      projectId: before.projectId, action: "attachment.archive", entityType: before.entityType,
      entityId: before.entityId, before,
    });
    return Response.json({ id: body.id, archived: true });
  } catch (error) {
    return errorResponse(error);
  }
}
