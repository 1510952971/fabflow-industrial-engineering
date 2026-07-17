import { env } from "cloudflare:workers";
import { ApiError } from "./api";

export const AUTH_TYPES = ["none", "bearer", "api_key", "basic"] as const;
export const ADAPTER_PROFILES = [
  "erp_po",
  "qms_test_pack",
  "qms_punch",
  "schedule_milestone",
  "vendor_equipment_model",
  "vendor_equipment_component",
  "bms_event",
  "epms_event",
  "scada_event",
] as const;

export type AuthType = typeof AUTH_TYPES[number];

export type PullMapping = {
  eventType: string;
  itemsPath?: string;
  nextCursorPath?: string;
  cursorParam?: string;
  externalIdPath: string;
  fields: Record<string, string>;
};

const adapterEventTypes: Record<string, string> = {
  erp_po: "erp.po.upsert",
  qms_test_pack: "qms.test_pack.upsert",
  qms_punch: "qms.punch.upsert",
  schedule_milestone: "schedule.milestone.upsert",
  vendor_equipment_model: "vendor.equipment_model.upsert",
  vendor_equipment_component: "vendor.equipment_component.upsert",
  bms_event: "bms.telemetry.upsert",
  epms_event: "epms.telemetry.upsert",
  scada_event: "scada.telemetry.upsert",
};

export function defaultMapping(adapterProfile: string): PullMapping {
  return {
    eventType: adapterEventTypes[adapterProfile] ?? "",
    itemsPath: "items",
    nextCursorPath: "nextCursor",
    cursorParam: "cursor",
    externalIdPath: "id",
    fields: {},
  };
}

export function parseMapping(value: string | null | undefined, adapterProfile: string): PullMapping {
  let parsed: Partial<PullMapping> = {};
  if (value?.trim()) {
    try { parsed = JSON.parse(value) as Partial<PullMapping>; }
    catch { throw new ApiError(400, "字段映射必须是有效 JSON", "INVALID_FIELD_MAPPING"); }
  }
  const mapping = { ...defaultMapping(adapterProfile), ...parsed };
  if (!mapping.eventType || !mapping.externalIdPath || !mapping.fields || Array.isArray(mapping.fields)) {
    throw new ApiError(400, "字段映射缺少 eventType、externalIdPath 或 fields", "INVALID_FIELD_MAPPING");
  }
  return mapping;
}

export function parseStringList(value: string | null | undefined, label = "白名单") {
  if (!value?.trim()) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error();
    return parsed.map((item) => item.trim()).filter(Boolean);
  } catch {
    throw new ApiError(400, `${label}必须是字符串数组 JSON`, "INVALID_ALLOWLIST");
  }
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

export function validateRemoteEndpoint(raw: string | null | undefined, request?: Request) {
  if (!raw) throw new ApiError(400, "服务端地址不能为空", "ENDPOINT_REQUIRED");
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new ApiError(400, "服务端地址格式无效", "INVALID_ENDPOINT"); }
  const localRequest = request ? ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname) : false;
  if (url.protocol !== "https:" && !(localRequest && url.protocol === "http:")) {
    throw new ApiError(400, "生产连接器必须使用 HTTPS", "HTTPS_REQUIRED");
  }
  const host = url.hostname.toLowerCase();
  if (!localRequest && (host === "localhost" || host.endsWith(".local") || host === "::1" || isPrivateIpv4(host))) {
    throw new ApiError(400, "连接器不能访问本机或私网地址", "PRIVATE_ENDPOINT_FORBIDDEN");
  }
  url.username = "";
  url.password = "";
  return url;
}

export function validateCredentialRef(value: string | null | undefined, authType: string) {
  if (authType === "none") return null;
  const ref = value?.trim();
  if (!ref || !/^[A-Z][A-Z0-9_]{2,63}$/.test(ref)) {
    throw new ApiError(400, "凭据引用须为大写环境变量名，例如 ERP_API_TOKEN", "INVALID_CREDENTIAL_REF");
  }
  return ref;
}

export function resolveCredential(ref: string | null | undefined) {
  if (!ref) return null;
  const value = (env as unknown as Record<string, unknown>)[ref];
  return typeof value === "string" && value ? value : null;
}

export function authHeaders(authType: string, credential: string | null) {
  const headers = new Headers({ Accept: "application/json" });
  if (authType === "none") return headers;
  if (!credential) throw new ApiError(503, "部署环境尚未绑定连接器凭据", "CREDENTIAL_BINDING_MISSING");
  if (authType === "bearer") headers.set("Authorization", `Bearer ${credential}`);
  else if (authType === "api_key") headers.set("X-API-Key", credential);
  else if (authType === "basic") headers.set("Authorization", `Basic ${btoa(credential)}`);
  else throw new ApiError(400, "不支持的认证类型", "INVALID_AUTH_TYPE");
  return headers;
}

export function readPath(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  return path.split(".").filter(Boolean).reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

export function mapPullItem(item: unknown, mapping: PullMapping) {
  if (!item || typeof item !== "object") throw new ApiError(422, "上游记录不是对象", "INVALID_SOURCE_RECORD");
  const payload: Record<string, unknown> = {};
  for (const [target, source] of Object.entries(mapping.fields)) payload[target] = readPath(item, source);
  return {
    externalId: String(readPath(item, mapping.externalIdPath) ?? "").trim(),
    eventType: mapping.eventType,
    payload,
  };
}

export async function fetchWithTimeout(url: URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal, redirect: "error" }); }
  finally { clearTimeout(timer); }
}
