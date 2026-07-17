import { clientIp } from "./api";

export const SESSION_COOKIE = "fabflow_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const PASSWORD_ITERATIONS = 210_000;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_SECONDS = 15 * 60;

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64Url(value);
}

export function validatePassword(password: string) {
  if (password.length < 10) return "密码至少需要 10 位";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "密码必须同时包含字母和数字";
  return null;
}

async function derive(password: string, salt: string, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations },
    key,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

export async function createPasswordCredential(password: string) {
  const validationError = validatePassword(password);
  if (validationError) throw new Error(validationError);
  const passwordSalt = randomToken(16);
  return {
    passwordSalt,
    iterations: PASSWORD_ITERATIONS,
    passwordHash: await derive(password, passwordSalt, PASSWORD_ITERATIONS),
  };
}

export async function verifyPassword(password: string, credential: { passwordHash: string; passwordSalt: string; iterations: number }) {
  const candidate = await derive(password, credential.passwordSalt, credential.iterations);
  if (candidate.length !== credential.passwordHash.length) return false;
  let mismatch = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    mismatch |= candidate.charCodeAt(index) ^ credential.passwordHash.charCodeAt(index);
  }
  return mismatch === 0;
}

export function createSessionToken() {
  return randomToken(32);
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function readSessionToken(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const item of cookie.split(";")) {
    const [name, ...parts] = item.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(parts.join("="));
  }
  return null;
}

export function sessionCookie(token: string, secure: boolean) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function requestUsesHttps(request: Request) {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export function sessionExpiry() {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
}

export async function requestIpHash(request: Request) {
  const ip = clientIp(request);
  return ip ? hashToken(ip) : null;
}
