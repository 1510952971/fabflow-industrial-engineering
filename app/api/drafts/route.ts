import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { userDrafts } from "@/db/schema";
import { ApiError, errorResponse } from "@/lib/api";
import { assertAuthenticated, authorize } from "@/lib/auth";

const MAX_DRAFT_BYTES = 512 * 1024;

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "data:read");
    assertAuthenticated(principal);
    const url = new URL(request.url);
    const draftType = url.searchParams.get("draftType")?.trim() ?? "";
    const draftKey = url.searchParams.get("draftKey")?.trim() ?? "";
    if (!draftType || !draftKey) throw new ApiError(400, "草稿类型和键不能为空", "INVALID_INPUT");
    const [draft] = await getDb().select().from(userDrafts).where(and(
      eq(userDrafts.userId, principal.id), eq(userDrafts.draftType, draftType), eq(userDrafts.draftKey, draftKey),
    )).limit(1);
    return Response.json({ draft: draft ? { ...draft, payload: JSON.parse(draft.payloadJson) } : null });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const principal = await authorize(request, "data:write");
    assertAuthenticated(principal);
    const body = await request.json() as { draftType?: string; draftKey?: string; payload?: unknown };
    const draftType = body.draftType?.trim() ?? "";
    const draftKey = body.draftKey?.trim() ?? "";
    if (!draftType || !draftKey || body.payload === undefined) throw new ApiError(400, "草稿内容不完整", "INVALID_INPUT");
    const payloadJson = JSON.stringify(body.payload);
    if (new TextEncoder().encode(payloadJson).byteLength > MAX_DRAFT_BYTES) throw new ApiError(413, "草稿超过 512KB，请先保存附件到 R2", "DRAFT_TOO_LARGE");
    const db = getDb();
    const [existing] = await db.select().from(userDrafts).where(and(
      eq(userDrafts.userId, principal.id), eq(userDrafts.draftType, draftType), eq(userDrafts.draftKey, draftKey),
    )).limit(1);
    const now = new Date().toISOString();
    if (existing) {
      await db.update(userDrafts).set({ payloadJson, revision: existing.revision + 1, updatedAt: now }).where(eq(userDrafts.id, existing.id));
    } else {
      await db.insert(userDrafts).values({ id: crypto.randomUUID(), userId: principal.id, draftType, draftKey, payloadJson, revision: 1, updatedAt: now });
    }
    return Response.json({ saved: true, revision: (existing?.revision ?? 0) + 1, updatedAt: now });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const principal = await authorize(request, "data:write");
    assertAuthenticated(principal);
    const body = await request.json() as { draftType?: string; draftKey?: string };
    if (!body.draftType || !body.draftKey) throw new ApiError(400, "草稿类型和键不能为空", "INVALID_INPUT");
    await getDb().delete(userDrafts).where(and(
      eq(userDrafts.userId, principal.id), eq(userDrafts.draftType, body.draftType), eq(userDrafts.draftKey, body.draftKey),
    ));
    return Response.json({ deleted: true });
  } catch (error) { return errorResponse(error); }
}
