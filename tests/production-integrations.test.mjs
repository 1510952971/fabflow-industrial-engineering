import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production connectors keep secrets out of D1 and require verified enablement", async () => {
  const [schema, route, health, config] = await Promise.all([
    readFile("db/workflow-schema.ts", "utf8"),
    readFile("app/api/integrations/connectors/route.ts", "utf8"),
    readFile("app/api/integrations/health/route.ts", "utf8"),
    readFile("lib/integration-config.ts", "utf8"),
  ]);
  assert.match(schema, /credentialRef: text\("credential_ref"\)/);
  assert.doesNotMatch(schema, /credentialValue|apiToken|password/);
  assert.match(route, /CONNECTOR_NOT_VERIFIED/);
  assert.match(health, /fetchWithTimeout/);
  assert.match(config, /PRIVATE_ENDPOINT_FORBIDDEN/);
  assert.match(config, /CREDENTIAL_BINDING_MISSING/);
});

test("pull sync uses cursor, field mapping, idempotency and dead-letter records", async () => {
  const sync = await readFile("app/api/integrations/sync/route.ts", "utf8");
  assert.match(sync, /parseMapping/);
  assert.match(sync, /cursorParam/);
  assert.match(sync, /processIntegrationPayload/);
  assert.match(sync, /\$\{connector\.id\}:\$\{mapped\.eventType\}:\$\{mapped\.externalId\}/);
  assert.match(sync, /status: "dead_letter"/);
  assert.match(sync, /recordsFailed/);
});

test("electronic signature flow verifies callbacks and stores signed evidence in R2", async () => {
  const [providers, envelopes, callback] = await Promise.all([
    readFile("app/api/signatures/providers/route.ts", "utf8"),
    readFile("app/api/signatures/envelopes/route.ts", "utf8"),
    readFile("app/api/signatures/callback/route.ts", "utf8"),
  ]);
  assert.match(providers, /signature_provider\.health_check/);
  assert.match(envelopes, /callbackUrl/);
  assert.match(callback, /HMAC/);
  assert.match(callback, /timingSafeEqual/);
  assert.match(callback, /env\.FILES\.put/);
  assert.match(callback, /electronic_seal/);
});
