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

export const projectConfigurations = sqliteTable("project_configurations", {
  projectId: text("project_id").primaryKey().references(() => projects.id),
  templateCode: text("template_code").notNull().default("FAB_FULL"),
  numberPrefix: text("number_prefix").notNull(),
  defaultWastePct: real("default_waste_pct").notNull().default(5),
  systemTemplateJson: text("system_template_json").notNull().default("[]"),
  fileCategoriesJson: text("file_categories_json").notNull().default("[]"),
  workflowStatus: text("workflow_status").notNull().default("initialized"),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

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

/** Extensible manufacturer product catalog. Categories and parameter
 * definitions are data, not hard-coded form columns, so every FAB discipline
 * can add its own product families and engineering attributes. */
export const productCategories = sqliteTable("product_categories", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  parentCode: text("parent_code"),
  discipline: text("discipline").notNull(),
  applicableSystemsJson: text("applicable_systems_json").notNull().default("[]"),
  icon: text("icon").notNull().default("◇"),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("product_categories_code_uq").on(table.code),
  index("product_categories_discipline_idx").on(table.discipline),
]);

export const productParameterDefinitions = sqliteTable("product_parameter_definitions", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").notNull().references(() => productCategories.id),
  key: text("key").notNull(),
  label: text("label").notNull(),
  groupName: text("group_name").notNull().default("详细规格"),
  dataType: text("data_type").notNull().default("text"),
  unit: text("unit"),
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  comparable: integer("comparable", { mode: "boolean" }).notNull().default(true),
  optionsJson: text("options_json").notNull().default("[]"),
  validationJson: text("validation_json").notNull().default("{}"),
  sortOrder: integer("sort_order").notNull().default(0),
  helpText: text("help_text").notNull().default(""),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("product_parameter_definitions_category_key_uq").on(table.categoryId, table.key),
  index("product_parameter_definitions_category_idx").on(table.categoryId, table.sortOrder),
]);

export const catalogProducts = sqliteTable("catalog_products", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").notNull().references(() => productCategories.id),
  factoryId: text("factory_id").references(() => equipmentFactories.id),
  manufacturer: text("manufacturer").notNull(),
  brand: text("brand").notNull(),
  productCode: text("product_code").notNull(),
  productName: text("product_name").notNull(),
  series: text("series").notNull().default(""),
  model: text("model").notNull(),
  description: text("description").notNull().default(""),
  country: text("country").notNull().default(""),
  lifecycleStatus: text("lifecycle_status").notNull().default("active"),
  applicableSystemsJson: text("applicable_systems_json").notNull().default("[]"),
  mediaJson: text("media_json").notNull().default("[]"),
  imagesJson: text("images_json").notNull().default("[]"),
  minPressureMpa: real("min_pressure_mpa"),
  maxPressureMpa: real("max_pressure_mpa"),
  minTemperatureC: real("min_temperature_c"),
  maxTemperatureC: real("max_temperature_c"),
  nominalSize: text("nominal_size"),
  connectionStandard: text("connection_standard"),
  wettedMaterialsJson: text("wetted_materials_json").notNull().default("[]"),
  surfaceFinish: text("surface_finish"),
  cleanlinessGrade: text("cleanliness_grade"),
  maxFlow: real("max_flow"),
  flowUnit: text("flow_unit"),
  supplyVoltage: text("supply_voltage"),
  signalProtocol: text("signal_protocol"),
  ingressProtection: text("ingress_protection"),
  hazardousAreaRating: text("hazardous_area_rating"),
  certificationsJson: text("certifications_json").notNull().default("[]"),
  standardsJson: text("standards_json").notNull().default("[]"),
  specificationsJson: text("specifications_json").notNull().default("{}"),
  sourceDocument: text("source_document"),
  sourceUrl: text("source_url"),
  sourcePage: text("source_page"),
  revision: text("revision").notNull().default("A"),
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("catalog_products_brand_code_uq").on(table.brand, table.productCode),
  index("catalog_products_category_idx").on(table.categoryId),
  index("catalog_products_model_idx").on(table.model),
  index("catalog_products_status_idx").on(table.status),
]);

/**
 * Global source registry for the shared catalogue. A source is deliberately
 * not a product: one PDF can describe many models and one model can be
 * evidenced by a catalogue, a submittal drawing and a parameter sheet.
 */
export const catalogSourceDocuments = sqliteTable("catalog_source_documents", {
  id: text("id").primaryKey(), sourceKey: text("source_key").notNull(), sourceRoot: text("source_root").notNull().default(""), relativePath: text("relative_path").notNull(), fileName: text("file_name").notNull(), extension: text("extension").notNull(), contentType: text("content_type").notNull().default("application/octet-stream"), sizeBytes: integer("size_bytes").notNull().default(0), modifiedAt: text("modified_at"), sha256: text("sha256"), documentType: text("document_type").notNull().default("other"), parserType: text("parser_type").notNull().default("manual_review"), manufacturerHint: text("manufacturer_hint").notNull().default(""), productFamilyHint: text("product_family_hint").notNull().default(""), modelHint: text("model_hint").notNull().default(""), sourceRevision: text("source_revision").notNull().default(""), extractionStatus: text("extraction_status").notNull().default("queued"), extractedJson: text("extracted_json").notNull().default("{}"), errorMessage: text("error_message"), createdBy: text("created_by").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [uniqueIndex("catalog_source_documents_key_uq").on(table.sourceKey), index("catalog_source_documents_type_status_idx").on(table.documentType, table.extractionStatus), index("catalog_source_documents_manufacturer_idx").on(table.manufacturerHint), index("catalog_source_documents_path_idx").on(table.relativePath)]);

export const catalogSourceCandidates = sqliteTable("catalog_source_candidates", {
  id: text("id").primaryKey(), sourceDocumentId: text("source_document_id").notNull().references(() => catalogSourceDocuments.id), candidateKey: text("candidate_key").notNull(), productName: text("product_name").notNull().default(""), manufacturer: text("manufacturer").notNull().default(""), brand: text("brand").notNull().default(""), model: text("model").notNull().default(""), categoryHint: text("category_hint").notNull().default(""), systemsJson: text("systems_json").notNull().default("[]"), parametersJson: text("parameters_json").notNull().default("{}"), confidence: integer("confidence").notNull().default(0), status: text("status").notNull().default("needs_review"), promotedProductId: text("promoted_product_id").references(() => catalogProducts.id), reviewNote: text("review_note").notNull().default(""), createdBy: text("created_by").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [uniqueIndex("catalog_source_candidates_key_uq").on(table.candidateKey), index("catalog_source_candidates_source_status_idx").on(table.sourceDocumentId, table.status), index("catalog_source_candidates_model_idx").on(table.model)]);

export const productVariants = sqliteTable("product_variants", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => catalogProducts.id),
  sku: text("sku").notNull(),
  optionCode: text("option_code").notNull().default(""),
  name: text("name").notNull(),
  specificationsJson: text("specifications_json").notNull().default("{}"),
  dimensionsJson: text("dimensions_json").notNull().default("{}"),
  weightKg: real("weight_kg"),
  leadTimeWeeks: integer("lead_time_weeks"),
  unitPriceCny: real("unit_price_cny"),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("product_variants_product_sku_uq").on(table.productId, table.sku),
  index("product_variants_product_idx").on(table.productId),
]);

export const productApplications = sqliteTable("product_applications", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => catalogProducts.id),
  systemCode: text("system_code").notNull(),
  service: text("service").notNull(),
  medium: text("medium").notNull().default(""),
  suitability: text("suitability").notNull().default("approved"),
  limitations: text("limitations").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("product_applications_product_system_service_uq").on(table.productId, table.systemCode, table.service),
  index("product_applications_system_idx").on(table.systemCode, table.suitability),
]);

/** Project-specific requirements extracted from an uploaded technical specification.
 * Catalog products remain global and are referenced by the selected product/variant IDs. */
export const projectProductRequirements = sqliteTable("project_product_requirements", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  requirementCode: text("requirement_code").notNull(),
  title: text("title").notNull(),
  systemCode: text("system_code").notNull(),
  categoryId: text("category_id").notNull().references(() => productCategories.id),
  attachmentId: text("attachment_id"),
  sourceFileName: text("source_file_name").notNull().default(""),
  sourceRevision: text("source_revision").notNull().default("A"),
  medium: text("medium").notNull().default(""),
  designPressureMpa: real("design_pressure_mpa"),
  designTemperatureC: real("design_temperature_c"),
  nominalSize: text("nominal_size").notNull().default(""),
  connectionStandard: text("connection_standard").notNull().default(""),
  requiredMaterialsJson: text("required_materials_json").notNull().default("[]"),
  requiredCertificationsJson: text("required_certifications_json").notNull().default("[]"),
  requiredStandardsJson: text("required_standards_json").notNull().default("[]"),
  requiredBrandsJson: text("required_brands_json").notNull().default("[]"),
  requiredSpecificationsJson: text("required_specifications_json").notNull().default("{}"),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("draft"),
  selectedProductId: text("selected_product_id").references(() => catalogProducts.id),
  selectedVariantId: text("selected_variant_id").references(() => productVariants.id),
  selectionStatus: text("selection_status").notNull().default("unmatched"),
  selectedBy: text("selected_by"),
  selectedAt: text("selected_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("project_product_requirements_project_code_uq").on(table.projectId, table.requirementCode),
  index("project_product_requirements_project_status_idx").on(table.projectId, table.status),
  index("project_product_requirements_category_idx").on(table.categoryId),
]);

export const catalogSelectionRuns = sqliteTable("catalog_selection_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  requirementId: text("requirement_id").notNull().references(() => projectProductRequirements.id),
  status: text("status").notNull(),
  matchedCount: integer("matched_count").notNull().default(0),
  blockedCount: integer("blocked_count").notNull().default(0),
  submittedBy: text("submitted_by").notNull(),
  inputJson: text("input_json").notNull(),
  createdAt: createdAt(),
}, (table) => [
  index("catalog_selection_runs_requirement_idx").on(table.requirementId, table.createdAt),
  index("catalog_selection_runs_project_idx").on(table.projectId, table.createdAt),
]);

export const catalogSelectionResults = sqliteTable("catalog_selection_results", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => catalogSelectionRuns.id),
  productId: text("product_id").notNull().references(() => catalogProducts.id),
  score: integer("score").notNull(),
  status: text("status").notNull(),
  checksJson: text("checks_json").notNull(),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("catalog_selection_results_run_product_uq").on(table.runId, table.productId),
  index("catalog_selection_results_run_idx").on(table.runId, table.score),
]);

export const technicalSpecExtractions = sqliteTable("technical_spec_extractions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  requirementId: text("requirement_id").notNull().references(() => projectProductRequirements.id),
  attachmentId: text("attachment_id").notNull(),
  fileName: text("file_name").notNull(),
  parserType: text("parser_type").notNull(),
  pageCount: integer("page_count").notNull().default(0),
  extractedJson: text("extracted_json").notNull(),
  confidenceJson: text("confidence_json").notNull().default("{}"),
  textExcerpt: text("text_excerpt").notNull().default(""),
  status: text("status").notNull().default("needs_review"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: text("confirmed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("technical_spec_extractions_requirement_idx").on(table.requirementId, table.createdAt),
  index("technical_spec_extractions_project_status_idx").on(table.projectId, table.status),
]);

export const catalogCandidates = sqliteTable("catalog_candidates", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  requirementId: text("requirement_id").notNull().references(() => projectProductRequirements.id),
  candidateCode: text("candidate_code").notNull(),
  proposedProductName: text("proposed_product_name").notNull(),
  categoryId: text("category_id").notNull().references(() => productCategories.id),
  manufacturer: text("manufacturer").notNull().default(""),
  brand: text("brand").notNull().default(""),
  model: text("model").notNull().default(""),
  supplier: text("supplier").notNull().default(""),
  rfqNumber: text("rfq_number").notNull().default(""),
  technicalQueryNumber: text("technical_query_number").notNull().default(""),
  requirementSnapshotJson: text("requirement_snapshot_json").notNull(),
  vendorDataJson: text("vendor_data_json").notNull().default("{}"),
  promotedProductId: text("promoted_product_id").references(() => catalogProducts.id),
  status: text("status").notNull().default("draft"),
  assignedTo: text("assigned_to"),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("catalog_candidates_project_code_uq").on(table.projectId, table.candidateCode),
  index("catalog_candidates_requirement_idx").on(table.requirementId, table.status),
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

export const equipmentMaterialSelections = sqliteTable("equipment_material_selections", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  equipmentModelId: text("equipment_model_id").notNull().references(() => equipmentModels.id),
  componentId: text("component_id").notNull().references(() => equipmentComponents.id),
  materialId: text("material_id").notNull().references(() => materials.id),
  runId: text("run_id").notNull().references(() => selectionRuns.id),
  quantity: real("quantity").notNull().default(1),
  status: text("status").notNull(),
  score: integer("score").notNull(),
  selectedBy: text("selected_by").notNull(),
  selectedAt: text("selected_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("equipment_material_selections_project_component_uq").on(table.projectId, table.componentId),
  index("equipment_material_selections_model_idx").on(table.projectId, table.equipmentModelId, table.status),
]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("active"),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("users_email_uq").on(table.email)]);

/** Password material is kept separate from the user directory. Passwords are
 * PBKDF2 hashes; raw passwords are never persisted. */
export const authCredentials = sqliteTable("auth_credentials", {
  userId: text("user_id").primaryKey().references(() => users.id),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  iterations: integer("iterations").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  passwordChangedAt: text("password_changed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Opaque browser sessions. Only the SHA-256 token hash is stored in D1. */
export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  status: text("status").notNull().default("active"),
  expiresAt: text("expires_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("auth_sessions_token_hash_uq").on(table.tokenHash),
  index("auth_sessions_user_status_idx").on(table.userId, table.status),
  index("auth_sessions_expiry_idx").on(table.expiresAt),
]);

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

export const releaseGates = sqliteTable("release_gates", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  gateType: text("gate_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  revision: text("revision").notNull().default("A"),
  approvalRequestId: text("approval_request_id").references(() => approvalRequests.id),
  validationSnapshotJson: text("validation_snapshot_json").notNull(),
  status: text("status").notNull().default("draft"),
  submittedBy: text("submitted_by").notNull(),
  frozenBy: text("frozen_by"),
  frozenAt: text("frozen_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("release_gates_entity_revision_uq").on(table.projectId, table.gateType, table.entityType, table.entityId, table.revision),
  index("release_gates_project_status_idx").on(table.projectId, table.status),
  index("release_gates_approval_idx").on(table.approvalRequestId),
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
