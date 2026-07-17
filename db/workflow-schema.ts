import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { approvalRequests, projects } from "./schema";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);

/** Immutable decisions for every approval step. */
export const approvalStepDecisions = sqliteTable("approval_step_decisions", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => approvalRequests.id),
  stepIndex: integer("step_index").notNull(),
  stepName: text("step_name").notNull(),
  action: text("action").notNull(),
  actorEmail: text("actor_email").notNull(),
  note: text("note").notNull().default(""),
  decidedAt: createdAt(),
}, (table) => [
  uniqueIndex("approval_step_request_index_uq").on(table.requestId, table.stepIndex),
  index("approval_step_request_idx").on(table.requestId),
]);

/** Generic immutable snapshots used by update, delete and restore operations. */
export const recordVersions = sqliteTable("record_versions", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  version: integer("version").notNull(),
  operation: text("operation").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("record_versions_entity_version_uq").on(table.entityType, table.entityId, table.version),
  index("record_versions_project_idx").on(table.projectId, table.createdAt),
]);

/** Non-secret connector state. Secrets remain in managed runtime bindings. */
export const integrationConnectors = sqliteTable("integration_connectors", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  sourceSystem: text("source_system").notNull(),
  displayName: text("display_name").notNull(),
  mode: text("mode").notNull(),
  endpointUrl: text("endpoint_url"),
  adapterProfile: text("adapter_profile").notNull().default("erp_po"),
  authType: text("auth_type").notNull().default("none"),
  credentialRef: text("credential_ref"),
  fieldMappingJson: text("field_mapping_json").notNull().default("{}"),
  inboundAllowlistJson: text("inbound_allowlist_json").notNull().default("[]"),
  healthcheckPath: text("healthcheck_path"),
  timeoutMs: integer("timeout_ms").notNull().default(10000),
  cursor: text("cursor"),
  status: text("status").notNull().default("not_configured"),
  lastSyncAt: text("last_sync_at"),
  lastSuccessAt: text("last_success_at"),
  lastHealthCheckAt: text("last_health_check_at"),
  verifiedAt: text("verified_at"),
  lastError: text("last_error"),
  retryLimit: integer("retry_limit").notNull().default(5),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("integration_connectors_project_source_uq").on(table.projectId, table.sourceSystem),
  index("integration_connectors_status_idx").on(table.status, table.updatedAt),
]);
/** One immutable-at-completion record per outbound health check or pull sync. */
export const integrationSyncRuns = sqliteTable("integration_sync_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  connectorId: text("connector_id").notNull().references(() => integrationConnectors.id),
  runType: text("run_type").notNull(),
  status: text("status").notNull().default("running"),
  cursorFrom: text("cursor_from"),
  cursorTo: text("cursor_to"),
  recordsRead: integer("records_read").notNull().default(0),
  recordsWritten: integer("records_written").notNull().default(0),
  recordsFailed: integer("records_failed").notNull().default(0),
  responseCode: integer("response_code"),
  errorMessage: text("error_message"),
  requestedBy: text("requested_by").notNull(),
  startedAt: createdAt(),
  finishedAt: text("finished_at"),
}, (table) => [
  index("integration_sync_runs_project_idx").on(table.projectId, table.startedAt),
  index("integration_sync_runs_connector_idx").on(table.connectorId, table.startedAt),
]);

/** E-sign provider configuration stores only secret binding references. */
export const signatureProviders = sqliteTable("signature_providers", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  providerType: text("provider_type").notNull().default("generic_rest"),
  displayName: text("display_name").notNull(),
  endpointUrl: text("endpoint_url").notNull(),
  authType: text("auth_type").notNull().default("bearer"),
  credentialRef: text("credential_ref").notNull(),
  callbackSecretRef: text("callback_secret_ref").notNull(),
  healthcheckPath: text("healthcheck_path").notNull().default("/health"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("not_configured"),
  lastHealthCheckAt: text("last_health_check_at"),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("signature_providers_project_name_uq").on(table.projectId, table.displayName),
  index("signature_providers_status_idx").on(table.status, table.updatedAt),
]);

/** Tracks requests and signed evidence returned by an external e-sign service. */
export const signatureEnvelopes = sqliteTable("signature_envelopes", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  providerId: text("provider_id").notNull().references(() => signatureProviders.id),
  attachmentId: text("attachment_id").notNull(),
  evidenceAttachmentId: text("evidence_attachment_id"),
  title: text("title").notNull(),
  signersJson: text("signers_json").notNull(),
  status: text("status").notNull().default("draft"),
  externalEnvelopeId: text("external_envelope_id"),
  requestedBy: text("requested_by").notNull(),
  submittedAt: text("submitted_at"),
  completedAt: text("completed_at"),
  failedAt: text("failed_at"),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("signature_envelopes_project_status_idx").on(table.projectId, table.status),
  index("signature_envelopes_external_idx").on(table.externalEnvelopeId),
]);