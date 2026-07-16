import { and, count, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { attachments } from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { authorize } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const allowedEntities = new Set(["project", "system", "tag", "interface", "material", "equipment_model", "selection_run", "test_pack", "punch", "approval"]);

export async function GET(request: Request) {
  try {
    await authorize(request, "files:read");
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? "proj-fab2a";
    const rows = await getDb().select().from(attachments).where(eq(attachments.projectId, projectId)).orderBy(desc(attachments.createdAt)).limit(100);
    return Response.json({ files: rows });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await authorize(request, "files:write");
    const form = await request.formData();
    const file = form.get("file");
    const projectId = String(form.get("projectId") ?? "proj-fab2a");
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
    const [{ total }] = await db.select({ total: count() }).from(attachments).where(and(eq(attachments.projectId, projectId), eq(attachments.entityType, entityType), eq(attachments.entityId, entityId), eq(attachments.category, category)));
    const version = Number(total) + 1;
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, "_");
    const objectKey = `${projectId}/${entityType}/${entityId}/${category}/v${version}-${crypto.randomUUID()}-${safeName}`;
    await env.FILES.put(objectKey, bytes, { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { projectId, entityType, entityId, category, uploadedBy: principal.email, sha256 } });
    const row = { id: crypto.randomUUID(), projectId, entityType, entityId, category, fileName: file.name, objectKey, contentType: file.type || "application/octet-stream", sizeBytes: file.size, sha256, version, uploadedBy: principal.email };
    await db.insert(attachments).values(row);
    await writeAudit(request, principal, { projectId, action: "attachment.upload", entityType, entityId, after: { attachmentId: row.id, fileName: row.fileName, sha256, version } });
    return Response.json({ file: row }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
