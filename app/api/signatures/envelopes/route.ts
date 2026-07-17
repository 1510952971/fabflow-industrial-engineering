import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { attachments } from "@/db/schema";
import { signatureEnvelopes, signatureProviders } from "@/db/workflow-schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { authHeaders, fetchWithTimeout, resolveCredential, validateRemoteEndpoint } from "@/lib/integration-config";

type Signer = { name: string; email: string; order?: number; role?: string };

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "signatures:read");
    const projectId = new URL(request.url).searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId);
    const rows = await getDb().select().from(signatureEnvelopes).where(eq(signatureEnvelopes.projectId, projectId)).orderBy(desc(signatureEnvelopes.createdAt)).limit(100);
    return Response.json({ envelopes: rows });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  let envelopeId: string | null = null;
  try {
    const principal = await authorize(request, "signatures:create");
    assertAuthenticated(principal);
    const body = await request.json() as { projectId?: string; providerId?: string; attachmentId?: string; title?: string; signers?: Signer[] };
    const projectId = body.projectId ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId, true);
    if (!body.providerId || !body.attachmentId || !body.title || !Array.isArray(body.signers) || body.signers.length < 1 || body.signers.length > 20) {
      throw new ApiError(400, "签章服务、附件、标题及 1–20 位签署人必填", "INVALID_INPUT");
    }
    const signers = body.signers.map((signer, index) => ({
      name: String(signer.name ?? "").trim(), email: String(signer.email ?? "").trim().toLowerCase(),
      order: Number(signer.order ?? index + 1), role: String(signer.role ?? "signer"),
    }));
    if (signers.some((signer) => !signer.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(signer.email))) throw new ApiError(400, "签署人姓名或邮箱无效", "INVALID_SIGNERS");
    const db = getDb();
    const [provider] = await db.select().from(signatureProviders).where(and(eq(signatureProviders.id, body.providerId), eq(signatureProviders.projectId, projectId))).limit(1);
    if (!provider?.enabled || provider.status !== "healthy") throw new ApiError(409, "签章服务尚未通过检查并启用", "PROVIDER_NOT_READY");
    const [attachment] = await db.select().from(attachments).where(and(eq(attachments.id, body.attachmentId), eq(attachments.projectId, projectId))).limit(1);
    if (!attachment || attachment.status === "archived") throw new ApiError(404, "待签附件不存在或已归档", "ATTACHMENT_NOT_FOUND");
    if (!env.FILES) throw new ApiError(503, "R2 文件存储尚未绑定", "R2_UNAVAILABLE");
    const object = await env.FILES.get(attachment.objectKey);
    if (!object) throw new ApiError(404, "R2 待签文件不存在", "FILE_NOT_FOUND");
    envelopeId = crypto.randomUUID();
    await db.insert(signatureEnvelopes).values({
      id: envelopeId, projectId, providerId: provider.id, attachmentId: attachment.id, title: body.title.trim(),
      signersJson: JSON.stringify(signers), status: "submitting", requestedBy: principal.email,
    });
    const bytes = await object.arrayBuffer();
    const form = new FormData();
    form.set("file", new Blob([bytes], { type: attachment.contentType }), attachment.fileName);
    form.set("title", body.title.trim());
    form.set("signers", JSON.stringify(signers));
    form.set("clientEnvelopeId", envelopeId);
    form.set("callbackUrl", `${new URL(request.url).origin}/api/signatures/callback?providerId=${encodeURIComponent(provider.id)}`);
    const endpoint = validateRemoteEndpoint(provider.endpointUrl, request);
    const headers = authHeaders(provider.authType, resolveCredential(provider.credentialRef));
    const response = await fetchWithTimeout(endpoint, { method: "POST", headers, body: form }, 30000);
    if (!response.ok) throw new ApiError(502, `签章服务提交返回 HTTP ${response.status}`, "SIGNATURE_SUBMIT_FAILED");
    const result = await response.json() as { id?: string; envelopeId?: string; status?: string };
    const externalEnvelopeId = String(result.id ?? result.envelopeId ?? "").trim();
    if (!externalEnvelopeId) throw new ApiError(502, "签章服务响应缺少 envelope id", "INVALID_SIGNATURE_RESPONSE");
    const now = new Date().toISOString();
    await db.update(signatureEnvelopes).set({ externalEnvelopeId, status: String(result.status ?? "submitted"), submittedAt: now, updatedAt: now }).where(eq(signatureEnvelopes.id, envelopeId));
    await writeAudit(request, principal, { projectId, action: "signature_envelope.submit", entityType: "signature_envelope", entityId: envelopeId, after: { providerId: provider.id, attachmentId: attachment.id, externalEnvelopeId, signers: signers.map(({ email, order }) => ({ email, order })) } });
    return Response.json({ envelope: { id: envelopeId, externalEnvelopeId, status: result.status ?? "submitted" } }, { status: 201 });
  } catch (error) {
    if (envelopeId) {
      try {
        const now = new Date().toISOString(); const message = error instanceof Error ? error.message : "签章提交失败";
        await getDb().update(signatureEnvelopes).set({ status: "failed", failedAt: now, errorMessage: message, updatedAt: now }).where(eq(signatureEnvelopes.id, envelopeId));
      } catch { /* Preserve the original response. */ }
    }
    return errorResponse(error);
  }
}
