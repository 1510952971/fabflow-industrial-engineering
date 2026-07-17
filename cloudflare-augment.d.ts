/* eslint-disable @typescript-eslint/no-explicit-any */

// Wrangler's runtime declarations intentionally infer response.json() as
// unknown unless every call supplies a type argument. The application already
// validates HTTP status and payload shape at its API boundaries, so preserve
// the browser-compatible default here while retaining generated Worker types.
interface Body {
  json(): Promise<any>;
}

interface Request {
  json(): Promise<any>;
}

interface Response {
  json(): Promise<any>;
}

interface R2ObjectBody {
  json(): Promise<any>;
}

interface CloudflareEnv {
  INTEGRATION_API_KEY?: string;
  AUTH_BOOTSTRAP_TOKEN?: string;
}

declare namespace Cloudflare {
  interface Env {
    INTEGRATION_API_KEY?: string;
  AUTH_BOOTSTRAP_TOKEN?: string;
  }
}
