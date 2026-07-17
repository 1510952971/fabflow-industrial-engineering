import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inferTechnicalSpecification } from "../lib/technical-spec-parser.ts";

test("technical specification extraction recognizes FAB engineering conditions", () => {
  const { extracted, confidence } = inferTechnicalSpecification(`电子特气 VMB 隔膜阀
介质: SiH4
设计压力: 8 bar
设计温度: 80 °C
尺寸 DN15
连接 VCR
材质 316L EP
SEMI F20
认证 CE
品牌: Fujikin`);
  assert.equal(extracted.systemCode, "SGAS");
  assert.equal(extracted.medium, "SiH4");
  assert.equal(extracted.designPressureMpa, 0.8);
  assert.equal(extracted.designTemperatureC, 80);
  assert.equal(extracted.nominalSize, "DN15");
  assert.equal(extracted.connectionStandard, "VCR");
  assert.ok(extracted.materials.includes("316L EP"));
  assert.ok(extracted.standards.includes("SEMI F20"));
  assert.ok(extracted.brands.includes("Fujikin"));
  assert.equal(extracted.categoryHint, "VALVE");
  assert.ok(confidence.systemCode >= 0.8);
});

test("five-step workflow is persisted and enforced by service APIs", async () => {
  const [schema, migration, bootstrap, technicalSpecs, candidates, batch, gates, approvals, master, projectUi, factoryUi, bomUi] = await Promise.all([
    readFile("db/schema.ts", "utf8"), readFile("drizzle/0012_previous_doctor_octopus.sql", "utf8"),
    readFile("app/api/project-bootstrap/route.ts", "utf8"), readFile("app/api/technical-specs/route.ts", "utf8"),
    readFile("app/api/catalog-candidates/route.ts", "utf8"), readFile("app/api/equipment/batch-validate/route.ts", "utf8"),
    readFile("app/api/release-gates/route.ts", "utf8"), readFile("app/api/approvals/route.ts", "utf8"),
    readFile("app/api/master-data/route.ts", "utf8"), readFile("app/project-catalog-selection.tsx", "utf8"),
    readFile("app/equipment-factory.tsx", "utf8"), readFile("app/modules.tsx", "utf8"),
  ]);
  for (const table of ["projectConfigurations", "technicalSpecExtractions", "catalogCandidates", "equipmentMaterialSelections", "releaseGates"]) assert.match(schema, new RegExp(`export const ${table}`));
  for (const table of ["project_configurations", "technical_spec_extractions", "catalog_candidates", "equipment_material_selections", "release_gates"]) assert.match(migration, new RegExp(table));
  assert.match(bootstrap, /facilitySystems/);
  assert.match(bootstrap, /projectConfigurations/);
  assert.match(technicalSpecs, /status:body\.confirmed\?"confirmed":"needs_review"/);
  assert.match(candidates, /rfq_preparation/);
  assert.match(candidates, /technical_review/);
  assert.match(candidates, /ready_for_catalog/);
  assert.match(candidates, /status: "pending_review"/);
  assert.match(batch, /equipmentMaterialSelections/);
  assert.match(batch, /equipment_internal_selection/);
  assert.match(batch, /BATCH_SELECTION_BLOCKED/);
  assert.match(gates, /catalog_selection/);
  assert.match(gates, /equipment_bom/);
  assert.match(gates, /project_release/);
  assert.match(gates, /RELEASE_GATE_BLOCKED/);
  assert.match(approvals, /db\.update\(releaseGates\)/);
  assert.match(master, /PROJECT_RELEASE_REQUIRED/);
  assert.match(projectUi, /提交选型冻结审批/);
  assert.match(projectUi, /生成候选记录/);
  assert.match(factoryUi, /整机自动配材并校验/);
  assert.match(factoryUi, /提交整机 BOM 冻结审批/);
  assert.match(bomUi, /提交项目发布审批/);
});