import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () => text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  region: text("region").notNull().default("CN"),
  fab: text("fab").notNull().default("FAB-2A"),
  phase: text("phase").notNull().default("detailed_design"),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("projects_code_uq").on(table.code)]);

export const systems = sqliteTable("systems", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  discipline: text("discipline").notNull(),
  ownerEmail: text("owner_email"),
  designMaturity: integer("design_maturity").notNull().default(0),
  status: text("status").notNull().default("design"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("systems_project_code_uq").on(table.projectId, table.code),
  index("systems_project_idx").on(table.projectId),
]);

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  systemId: text("system_id").notNull().references(() => systems.id),
  tagNo: text("tag_no").notNull(),
  entityType: text("entity_type").notNull(),
  description: text("description").notNull().default(""),
  designPressureMpa: real("design_pressure_mpa"),
  designTemperatureC: real("design_temperature_c"),
  medium: text("medium"),
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("tags_project_tag_no_uq").on(table.projectId, table.tagNo),
  index("tags_system_idx").on(table.systemId),
]);

export const interfaces = sqliteTable("interfaces", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  fromTagId: text("from_tag_id"),
  toTagId: text("to_tag_id"),
  interfaceCode: text("interface_code").notNull(),
  medium: text("medium").notNull(),
  connectionStandard: text("connection_standard").notNull(),
  nominalSize: text("nominal_size").notNull(),
  designPressureMpa: real("design_pressure_mpa").notNull(),
  designTemperatureC: real("design_temperature_c").notNull(),
  cleanlinessGrade: text("cleanliness_grade").notNull().default("industrial"),
  ownerDiscipline: text("owner_discipline").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("interfaces_project_code_uq").on(table.projectId, table.interfaceCode),
  index("interfaces_project_idx").on(table.projectId),
]);

export const materials = sqliteTable("materials", {
  id: text("id").primaryKey(),
  manufacturer: text("manufacturer").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  grade: text("grade").notNull(),
  baseMaterial: text("base_material").notNull(),
  surfaceFinish: text("surface_finish").notNull(),
  cleanlinessGrade: text("cleanliness_grade").notNull(),
  maxPressureMpa: real("max_pressure_mpa").notNull(),
  minTemperatureC: real("min_temperature_c").notNull(),
  maxTemperatureC: real("max_temperature_c").notNull(),
  certificationsJson: text("certifications_json").notNull().default("[]"),
  status: text("status").notNull().default("approved"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("materials_code_uq").on(table.code),
  index("materials_grade_idx").on(table.grade),
]);

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  poNumber: text("po_number").notNull(),
  supplier: text("supplier").notNull(),
  packageCode: text("package_code").notNull(),
  amountCny: real("amount_cny").notNull().default(0),
  promisedDate: text("promised_date"),
  status: text("status").notNull().default("placed"),
  sourceSystem: text("source_system").notNull().default("manual"),
  externalId: text("external_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("purchase_orders_project_po_uq").on(table.projectId, table.poNumber),
  index("purchase_orders_project_idx").on(table.projectId),
]);

/** Project BOM lines produced by selection, calculation or manual engineering entry. */
export const bomItems = sqliteTable("bom_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  systemId: text("system_id").references(() => systems.id),
  materialId: text("material_id").references(() => materials.id),
  itemCode: text("item_code").notNull(),
  itemName: text("item_name").notNull(),
  specification: text("specification").notNull().default(""),
  quantity: real("quantity").notNull().default(0),
  unit: text("unit").notNull().default("件"),
  unitPriceCny: real("unit_price_cny").notNull().default(0),
  wastePct: real("waste_pct").notNull().default(5),
  sourceType: text("source_type").notNull().default("manual"),
  sourceId: text("source_id"),
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("bom_items_project_idx").on(table.projectId),
  index("bom_items_system_idx").on(table.systemId),
  index("bom_items_material_idx").on(table.materialId),
]);

export const testPacks = sqliteTable("test_packs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  systemId: text("system_id").references(() => systems.id),
  packNumber: text("pack_number").notNull(),
  title: text("title").notNull(),
  testType: text("test_type").notNull(),
  status: text("status").notNull().default("draft"),
  witnessRequired: integer("witness_required", { mode: "boolean" }).notNull().default(false),
  signedAt: text("signed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("test_packs_project_number_uq").on(table.projectId, table.packNumber),
  index("test_packs_system_idx").on(table.systemId),
]);

export const punchItems = sqliteTable("punch_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  systemId: text("system_id").references(() => systems.id),
  punchNumber: text("punch_number").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  ownerEmail: text("owner_email"),
  dueDate: text("due_date"),
  status: text("status").notNull().default("open"),
  closedAt: text("closed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("punch_items_project_number_uq").on(table.projectId, table.punchNumber),
  index("punch_items_status_idx").on(table.projectId, table.status),
]);

export const managementOfChanges = sqliteTable("management_of_changes", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  systemId: text("system_id").references(() => systems.id),
  mocNumber: text("moc_number").notNull(),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  riskLevel: text("risk_level").notNull().default("medium"),
  costImpactCny: real("cost_impact_cny").notNull().default(0),
  scheduleImpactDays: integer("schedule_impact_days").notNull().default(0),
  ownerEmail: text("owner_email"),
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("moc_project_number_uq").on(table.projectId, table.mocNumber),
  index("moc_project_status_idx").on(table.projectId, table.status),
]);

export const constructionWorkPackages = sqliteTable("construction_work_packages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  systemId: text("system_id").references(() => systems.id),
  packageNumber: text("package_number").notNull(),
  title: text("title").notNull(),
  area: text("area").notNull(),
  ownerEmail: text("owner_email"),
  plannedStart: text("planned_start"),
  readinessJson: text("readiness_json").notNull().default("{}"),
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("cwp_project_number_uq").on(table.projectId, table.packageNumber),
  index("cwp_project_status_idx").on(table.projectId, table.status),
]);

export const workflowActions = sqliteTable("workflow_actions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id),
  actionType: text("action_type").notNull(),
  title: text("title").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  status: text("status").notNull().default("open"),
  assignedTo: text("assigned_to"),
  dueAt: text("due_at"),
  payloadJson: text("payload_json").notNull().default("{}"),
  requestedBy: text("requested_by").notNull(),
  completedAt: text("completed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("workflow_actions_project_status_idx").on(table.projectId, table.status),
  index("workflow_actions_entity_idx").on(table.entityType, table.entityId),
]);

export const equipmentFactories = sqliteTable("equipment_factories", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  contactEmail: text("contact_email"),
  qualityStatus: text("quality_status").notNull().default("qualified"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("equipment_factories_code_uq").on(table.code)]);

export const equipmentModels = sqliteTable("equipment_models", {
  id: text("id").primaryKey(),
  factoryId: text("factory_id").notNull().references(() => equipmentFactories.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  revision: text("revision").notNull(),
  designStandard: text("design_standard").notNull(),
  status: text("status").notNull().default("released"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("equipment_models_code_uq").on(table.code),
  index("equipment_models_factory_idx").on(table.factoryId),
]);

export const equipmentComponents = sqliteTable("equipment_components", {
  id: text("id").primaryKey(),
  equipmentModelId: text("equipment_model_id").notNull().references(() => equipmentModels.id),
  componentCode: text("component_code").notNull(),
  componentName: text("component_name").notNull(),
  function: text("function").notNull(),
  medium: text("medium").notNull(),
  allowedMaterialsJson: text("allowed_materials_json").notNull(),
  requiredFinish: text("required_finish").notNull(),
  requiredCleanliness: text("required_cleanliness").notNull(),
  designPressureMpa: real("design_pressure_mpa").notNull(),
  designTemperatureC: real("design_temperature_c").notNull(),
  connectionStandard: text("connection_standard").notNull(),
  nominalSize: text("nominal_size").notNull(),
  quantity: integer("quantity").notNull().default(1),
  criticality: text("criticality").notNull().default("B"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("equipment_components_model_code_uq").on(table.equipmentModelId, table.componentCode),
  index("equipment_components_model_idx").on(table.equipmentModelId),
]);

export const equipmentPorts = sqliteTable("equipment_ports", {
  id: text("id").primaryKey(),
  equipmentModelId: text("equipment_model_id").notNull().references(() => equipmentModels.id),
  portCode: text("port_code").notNull(),
  service: text("service").notNull(),
  direction: text("direction").notNull(),
  connectionStandard: text("connection_standard").notNull(),
  nominalSize: text("nominal_size").notNull(),
  pressureRatingMpa: real("pressure_rating_mpa").notNull(),
  temperatureRatingC: real("temperature_rating_c").notNull(),
  faceToFaceMm: real("face_to_face_mm"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("equipment_ports_model_code_uq").on(table.equipmentModelId, table.portCode),
  index("equipment_ports_model_idx").on(table.equipmentModelId),
]);

export const materialCompatibility = sqliteTable("material_compatibility", {
  id: text("id").primaryKey(),
  medium: text("medium").notNull(),
  materialGrade: text("material_grade").notNull(),
  rating: text("rating").notNull(),
  maxConcentrationPct: real("max_concentration_pct"),
  maxTemperatureC: real("max_temperature_c"),
  notes: text("notes").notNull().default(""),
  sourceStandard: text("source_standard").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("material_compatibility_medium_grade_uq").on(table.medium, table.materialGrade),
]);

/** Project/package technical requirements extracted from the approved technical file. */
export const technicalMaterialRules = sqliteTable("technical_material_rules", {
  id: text("id").primaryKey(),
  ruleCode: text("rule_code").notNull(),
  packageCode: text("package_code").notNull(),
  systemCode: text("system_code").notNull(),
  serviceName: text("service_name").notNull(),
  mediumCodesJson: text("medium_codes_json").notNull(),
  approvalRuleCode: text("approval_rule_code"),
  requiredGrade: text("required_grade").notNull(),
  requiredFinish: text("required_finish").notNull(),
  fittingStandard: text("fitting_standard").notNull(),
  valveType: text("valve_type").notNull(),
  flexibleTubePolicy: text("flexible_tube_policy").notNull().default("allowed"),
  doubleContainment: integer("double_containment", { mode: "boolean" }).notNull().default(false),
  nominalSizesJson: text("nominal_sizes_json").notNull().default("[]"),
  restrictions: text("restrictions").notNull().default(""),
  sourceDocument: text("source_document").notNull(),
  sourcePages: text("source_pages").notNull(),
  sourceClause: text("source_clause").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("technical_material_rules_code_uq").on(table.ruleCode),
  index("technical_material_rules_system_idx").on(table.systemCode),
]);

/** Brand approval rows from the package brand approval table. */
export const materialApprovalRules = sqliteTable("material_approval_rules", {
  id: text("id").primaryKey(),
  ruleCode: text("rule_code").notNull(),
  packageCode: text("package_code").notNull(),
  categoryCode: text("category_code").notNull(),
  itemName: text("item_name").notNull(),
  requiredGrade: text("required_grade").notNull(),
  allowedBrandsJson: text("allowed_brands_json").notNull(),
  restrictions: text("restrictions").notNull().default(""),
  sourceDocument: text("source_document").notNull(),
  sourcePage: text("source_page").notNull(),
  status: text("status").notNull().default("approved"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("material_approval_rules_code_uq").on(table.ruleCode),
  index("material_approval_rules_category_idx").on(table.categoryCode),
]);

export const selectionRuns = sqliteTable("selection_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  equipmentModelId: text("equipment_model_id").notNull().references(() => equipmentModels.id),
  componentId: text("component_id").references(() => equipmentComponents.id),
  status: text("status").notNull(),
  score: integer("score").notNull(),
  submittedBy: text("submitted_by").notNull(),
  inputJson: text("input_json").notNull(),
  createdAt: createdAt(),
}, (table) => [
  index("selection_runs_project_idx").on(table.projectId, table.createdAt),
]);

export const selectionResults = sqliteTable("selection_results", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => selectionRuns.id),
  ruleCode: text("rule_code").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull(),
  expected: text("expected").notNull(),
  actual: text("actual").notNull(),
  message: text("message").notNull(),
  createdAt: createdAt(),
}, (table) => [index("selection_results_run_idx").on(table.runId)]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("active"),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("users_email_uq").on(table.email)]);

export const userRoles = sqliteTable("user_roles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull(),
  scopeType: text("scope_type").notNull().default("global"),
  scopeId: text("scope_id").notNull().default("*"),
  grantedBy: text("granted_by").notNull(),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("user_roles_user_scope_uq").on(table.userId, table.role, table.scopeType, table.scopeId),
  index("user_roles_user_idx").on(table.userId),
]);

export const approvalRequests = sqliteTable("approval_requests", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  workflowType: text("workflow_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"),
  currentStep: integer("current_step").notNull().default(1),
  stepsJson: text("steps_json").notNull(),
  requestedBy: text("requested_by").notNull(),
  decidedBy: text("decided_by"),
  decisionNote: text("decision_note"),
  decidedAt: text("decided_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("approval_requests_project_status_idx").on(table.projectId, table.status),
  index("approval_requests_entity_idx").on(table.entityType, table.entityId),
]);

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  category: text("category").notNull(),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  version: integer("version").notNull().default(1),
  uploadedBy: text("uploaded_by").notNull(),
  signedBy: text("signed_by"),
  signedAt: text("signed_at"),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("attachments_object_key_uq").on(table.objectKey),
  index("attachments_entity_idx").on(table.projectId, table.entityType, table.entityId),
]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  requestId: text("request_id").notNull(),
  sourceIp: text("source_ip"),
  createdAt: createdAt(),
}, (table) => [
  index("audit_logs_project_created_idx").on(table.projectId, table.createdAt),
  index("audit_logs_entity_idx").on(table.entityType, table.entityId),
]);

export const integrationEvents = sqliteTable("integration_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  sourceSystem: text("source_system").notNull(),
  eventType: text("event_type").notNull(),
  externalId: text("external_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull().default("queued"),
  retryCount: integer("retry_count").notNull().default(0),
  errorMessage: text("error_message"),
  receivedAt: createdAt(),
  processedAt: text("processed_at"),
}, (table) => [
  uniqueIndex("integration_events_idempotency_uq").on(table.idempotencyKey),
  index("integration_events_status_idx").on(table.status, table.receivedAt),
]);

export const operationalEvents = sqliteTable("operational_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  sourceSystem: text("source_system").notNull(),
  tagNo: text("tag_no").notNull(),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull(),
  value: real("value"),
  unit: text("unit"),
  quality: text("quality").notNull().default("good"),
  occurredAt: text("occurred_at").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdAt: createdAt(),
}, (table) => [
  index("operational_events_tag_time_idx").on(table.tagNo, table.occurredAt),
  index("operational_events_severity_idx").on(table.severity, table.occurredAt),
]);
