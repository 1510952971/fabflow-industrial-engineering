import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public access is read-only and new users receive project-scoped RBAC", async () => {
  const auth = await readFile("lib/auth.ts", "utf8");
  assert.match(auth, /public_viewer:\s*\["data:read", "equipment:read"\]/);
  assert.doesNotMatch(auth, /public_viewer:[^\n]+files:read/);
  assert.match(auth, /scopeType: firstWorkspaceUser \? "global" : "project"/);
  assert.match(auth, /scopeId: firstWorkspaceUser \? "\*" : PUBLIC_DEMO_PROJECT_ID/);
  assert.match(auth, /assertProjectAccess/);
  assert.match(auth, /assertAuthenticated/);
});

test("current project and module use durable path routing", async () => {
  const context = await readFile("lib/project-context.ts", "utf8");
  const dynamicPage = await readFile("app/projects/[projectId]/[module]/page.tsx", "utf8");
  assert.match(context, /\/projects\/\$\{encodeURIComponent\(projectId\)\}\/\$\{slug\}/);
  assert.match(context, /return "项目工作台"/);
  assert.match(context, /parts\[0\] === "projects"/);
  assert.match(dynamicPage, /@\/app\/page/);
});

test("project data routes enforce server-side scope and sensitive consoles are not public", async () => {
  const files = [
    "app/api/master-data/route.ts",
    "app/api/workflow-actions/route.ts",
    "app/api/files/route.ts",
    "app/api/approvals/route.ts",
    "app/api/audit-logs/route.ts",
    "app/api/integrations/connectors/route.ts",
    "app/api/integrations/events/route.ts",
  ];
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
  for (let index = 0; index < sources.length; index += 1) {
    assert.match(sources[index], /assertProjectAccess/, `${files[index]} must enforce project scope`);
  }
  assert.match(sources[4], /authorize\(request, "audit:read"\)/);
  assert.match(sources[5], /authorize\(request, "integrations:read"\)/);
  assert.match(sources[6], /authorize\(request, "integrations:manage"\)/);
});

test("critical engineering states are persisted instead of reporting fake success", async () => {
  const [execution, controls, systems, globalFab] = await Promise.all([
    readFile("app/engineering-execution.tsx", "utf8"),
    readFile("app/program-controls.tsx", "utf8"),
    readFile("app/system-engineering.tsx", "utf8"),
    readFile("app/global-fab.tsx", "utf8"),
  ]);
  for (const workflow of ["design_input", "moc_state", "cwp_readiness", "test_pack_state", "system_completion"]) {
    assert.match(execution, new RegExp(`useWorkflowStates\\("${workflow}"\\)`));
  }
  assert.match(controls, /useWorkflowStates\("schedule_constraint"\)/);
  assert.match(controls, /useWorkflowStates\("iqc_state"\)/);
  assert.match(systems, /useWorkflowStates\("system_readiness"\)/);
  assert.match(systems, /entity: "interfaces"[\s\S]+status: "closed"/);
  assert.match(systems, /\/api\/engineering\/validate/);
  assert.match(globalFab, /useWorkflowStates\("document_signoff"\)/);
  assert.doesNotMatch(execution, /openMasterData\("constructionWorkPackages",p\.id\);notify\(`\$\{p\.id\} 已批准放行施工`\)/);
  assert.doesNotMatch(execution, /openMasterData\("workflowActions",current\.id\);notify\(`\$\{current\.id\} 已签发 RFC 证书`\)/);
  assert.doesNotMatch(controls, /openMasterData\("workflowActions",String\(x\[0\]\)\);notify\(`约束 \$\{x\[0\]\} 已分派`\)/);
});

test("approval chain records immutable step decisions and enforces step roles", async () => {
  const [route, schema] = await Promise.all([
    readFile("app/api/approvals/route.ts", "utf8"),
    readFile("db/workflow-schema.ts", "utf8"),
  ]);
  assert.match(route, /assertStepActor/);
  assert.match(route, /SELF_APPROVAL_FORBIDDEN/);
  assert.match(route, /INVALID_APPROVAL_CHAIN/);
  assert.match(schema, /approvalStepDecisions/);
  assert.match(schema, /uniqueIndex\("approval_step_request_index_uq"\)/);
});
