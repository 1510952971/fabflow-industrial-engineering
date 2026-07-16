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
  cursor: text("cursor"),
  status: text("status").notNull().default("not_configured"),
  lastSyncAt: text("last_sync_at"),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
  retryLimit: integer("retry_limit").notNull().default(5),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("integration_connectors_project_source_uq").on(table.projectId, table.sourceSystem),
  index("integration_connectors_status_idx").on(table.status, table.updatedAt),
]);
