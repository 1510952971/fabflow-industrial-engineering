import { and, count, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { attachments, auditLogs } from "@/db/schema";
import { signatureEnvelopes, signatureProviders } from "@/db/workflow-schema";
import { ApiError, errorResponse, requestId } from "@/lib/api";
import { fetchWithTimeout, resolveCredential, validateRemoteEndpoint } from "@/lib/integration-config";

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function POST(request: Request) {
  try {
    const providerId = new URL(request.url).searchParams.get("providerId");
    if (!providerId) throw new ApiError(400, "providerId 缺失", "INVALID_INPUT");
    const db = getDb();
    const [provider] = await db.select().from(signatureProviders).where(eq(signatureProviders.id, providerId)).limit(1);
    if (!provider?.enabled) throw new ApiError(404, "签章服务不存在或未启用", "PROVIDER_NOT_FOUND");
    const secret = resolveCredential(provider.callbackSecretRef);
    if (!secret) throw new ApiError(503, "签章回调密钥尚未绑定", "CALLBACK_SECRET_MISSING");
    const rawBody = await request.text();
    const supplied = (request.headers.get("x-fabflow-signature") ?? "").replace(/^sha256=/i, "").toLowerCase();
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
    if (!supplied || !timingSafeEqual(supplied, expected)) throw new ApiError(401, "签章回调签名无效", "INVALID_CALLBACK_SIGNATURE");
    let body: { externalEnvelopeId?: string; status?: string; signedFileUrl?: string };
    try { body = JSON.parse(rawBody) as typeof body; }
    catch { throw new ApiError(400, "回调 JSON 无效", "INVALID_CALLBACK_BODY"); }
    if (!body.externalEnvelopeId || !body.status) throw new ApiError(400, "externalEnvelopeId 和 status 必填", "INVALID_INPUT");
    const allowedStatuses = ["submitted", "viewed", "signed", "completed", "declined", "expired", "failed"];
    if (!allowedStatuses.includes(body.status)) throw new ApiError(400, "签章状态无效", "INVALID_SIGNATURE_STATUS");
    const [envelope] = await db.select().from(signatureEnvelopes).where(and(eq(signatureEnvelopes.providerId, provider.id), eq(signatureEnvelopes.externalEnvelopeId, body.externalEnvelopeId))).limit(1);
    if (!envelope) throw new ApiError(404, "签章信封不存在", "ENVELOPE_NOT_FOUND");
    let evidenceAttachmentId: string | null = envelope.evidenceAttachmentId;
    if (["signed", "completed"].includes(body.status)) {
      if (!body.signedFileUrl) throw new ApiError(422, "完成回调必须提供 signedFileUrl", "SIGNED_FILE_REQUIRED");
      if (!env.FILES) throw new ApiError(503, "R2 文件存储尚未绑定", "R2_UNAVAILABLE");
      const providerEndpoint = validateRemoteEndpoint(provider.endpointUrl, request);
      const signedUrl = validateRemoteEndpoint(body.signedFileUrl, request);
      if (signedUrl.origin !== providerEndpoint.origin) throw new ApiError(400, "签署文件地址必须与签章服务同源", "SIGNED_FILE_ORIGIN_FORBIDDEN");
      const response = await fetchWithTimeout(signedUrl, { method: "GET", redirect: "error" }, 30000);
      if (!response.ok) throw new ApiError(502, `签署文件下载返回 HTTP ${response.status}`, "SIGNED_FILE_DOWNLOAD_FAILED");
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 25 * 1024 * 1024) throw new ApiError(422, "签署文件大小必须在 1B–25MB", "SIGNED_FILE_SIZE_INVALID");
      const [source] = await db.select().from(attachments).where(eq(attachments.id, envelope.attachmentId)).limit(1);
      if (!source) throw new ApiError(404, "原始附件不存在", "ATTACHMENT_NOT_FOUND");
      const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
      const [{ total }] = await db.select({ total: count() }).from(attachments).where(and(
        eq(attachments.projectId, envelope.projectId), eq(attachments.entityType, source.entityType),
        eq(attachments.entityId, source.entityId), eq(attachments.category, "electronic_seal"),
      ));
      const version = Number(total) + 1;
      const fileName = source.fileName.replace(/(\.[^.]+)?$/, `-signed-v${version}.pdf`);
      evidenceAttachmentId = crypto.randomUUID();
      const objectKey = `${envelope.projectId}/${source.entityType}/${source.entityId}/electronic_seal/v${version}-${evidenceAttachmentId}.pdf`;
      await env.FILES.put(objectKey, bytes, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { providerId: provider.id, envelopeId: envelope.id, sha256: digest } });
      await db.insert(attachments).values({
        id: evidenceAttachmentId, projectId: envelope.projectId, entityType: source.entityType, entityId: source.entityId,
        category: "electronic_seal", fileName, objectKey, contentType: "application/pdf", sizeBytes: bytes.byteLength,
        sha256: digest, version, uploadedBy: `esign:${provider.displayName}`, signedBy: provider.displayName,
        signedAt: new Date().toISOString(), status: "signed",
      });
      await db.update(attachments).set({ signedBy: provider.displayName, signedAt: new Date().toISOString(), status: "signed" }).where(eq(attachments.id, source.id));
    }
    const now = new Date().toISOString();
    const terminal = ["signed", "completed"].includes(body.status);
    const failed = ["declined", "expired", "failed"].includes(body.status);
    await db.update(signatureEnvelopes).set({
      status: body.status, evidenceAttachmentId, completedAt: terminal ? now : envelope.completedAt,
      failedAt: failed ? now : envelope.failedAt, updatedAt: now,
    }).where(eq(signatureEnvelopes.id, envelope.id));
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), projectId: envelope.projectId, actorEmail: `esign:${provider.displayName}`,
      action: `signature_envelope.${body.status}`, entityType: "signature_envelope", entityId: envelope.id,
      beforeJson: JSON.stringify({ status: envelope.status }), afterJson: JSON.stringify({ status: body.status, evidenceAttachmentId }),
      requestId: requestId(request), sourceIp: request.headers.get("cf-connecting-ip"),
    });
    return Response.json({ received: true, envelopeId: envelope.id, status: body.status, evidenceAttachmentId });
  } catch (error) { return errorResponse(error); }
}
