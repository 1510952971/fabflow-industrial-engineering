export type EngineeringSystem = { id: string; code: string; name: string; discipline: string; ownerEmail?: string | null; designMaturity: number; status: string };
export type EngineeringTag = { id: string; systemId: string; tagNo: string; medium?: string | null; designPressureMpa?: number | null; designTemperatureC?: number | null; status: string };
export type EngineeringInterface = { id: string; fromTagId?: string | null; toTagId?: string | null; interfaceCode: string; medium: string; connectionStandard: string; nominalSize: string; designPressureMpa: number; designTemperatureC: number; cleanlinessGrade: string; ownerDiscipline: string; status: string };
export type EngineeringBomItem = { id: string; systemId?: string | null; materialId?: string | null; itemCode: string; sourceType: string; sourceId?: string | null; status: string };
export type EngineeringTestPack = { id: string; systemId?: string | null; packNumber: string; title: string; testType: string; status: string; witnessRequired: boolean; signedAt?: string | null };
export type EngineeringPunch = { id: string; systemId?: string | null; punchNumber: string; category: string; description: string; status: string };
export type EngineeringSelectionRun = { id: string; status: string; score: number };

export type EngineeringIssue = {
  id: string;
  severity: "critical" | "warning" | "info";
  category: "system" | "tag" | "interface" | "material" | "test" | "punch";
  title: string;
  detail: string;
  entityType: string;
  entityId: string;
  systemId?: string;
};

export type EngineeringValidationInput = {
  systems: EngineeringSystem[];
  tags: EngineeringTag[];
  interfaces: EngineeringInterface[];
  bomItems: EngineeringBomItem[];
  testPacks: EngineeringTestPack[];
  punchItems: EngineeringPunch[];
  selectionRuns: EngineeringSelectionRun[];
};

const closedStatuses = new Set(["closed", "completed", "complete", "approved", "signed", "已关闭", "已完成", "完成"]);
const hazardousMedia = /(SIH4|CL2|PH3|B2H6|H2|NH3|HF|HCL|氯气|硅烷|磷烷|氢氟酸|盐酸)/i;
const isClosed = (status: string) => closedStatuses.has(status.trim().toLowerCase()) || closedStatuses.has(status.trim());
const mismatch = (a?: string | null, b?: string | null) => Boolean(a && b && a.trim().toUpperCase() !== b.trim().toUpperCase());

export function validateEngineeringProject(input: EngineeringValidationInput) {
  const issues: EngineeringIssue[] = [];
  const tagById = new Map(input.tags.map((tag) => [tag.id, tag]));

  for (const system of input.systems) {
    const systemTags = input.tags.filter((tag) => tag.systemId === system.id);
    if (!systemTags.length) issues.push({ id: `system:${system.id}:no-tags`, severity: "warning", category: "system", title: `${system.code} 尚无 Tag`, detail: "系统边界存在，但没有可用于选型、接口和测试追踪的 Tag。", entityType: "systems", entityId: system.id, systemId: system.id });
    if (system.designMaturity < 60) issues.push({ id: `system:${system.id}:maturity`, severity: "warning", category: "system", title: `${system.code} 设计成熟度偏低`, detail: `当前设计成熟度 ${system.designMaturity}%，低于系统校验建议阈值 60%。`, entityType: "systems", entityId: system.id, systemId: system.id });
  }

  for (const tag of input.tags) {
    const missing = [!tag.medium && "介质", tag.designPressureMpa == null && "设计压力", tag.designTemperatureC == null && "设计温度"].filter(Boolean);
    if (missing.length) issues.push({ id: `tag:${tag.id}:basis`, severity: "critical", category: "tag", title: `${tag.tagNo} 设计输入不完整`, detail: `缺少：${missing.join("、")}，不能作为设备或材料选型依据。`, entityType: "tags", entityId: tag.id, systemId: tag.systemId });
  }

  for (const item of input.interfaces) {
    const from = item.fromTagId ? tagById.get(item.fromTagId) : undefined;
    const to = item.toTagId ? tagById.get(item.toTagId) : undefined;
    const systemId = from?.systemId ?? to?.systemId;
    if (!from && !to) issues.push({ id: `interface:${item.id}:orphan`, severity: "critical", category: "interface", title: `${item.interfaceCode} 未关联 Tag`, detail: "接口没有起点或终点 Tag，无法校核系统边界和设备接口。", entityType: "interfaces", entityId: item.id });
    else if (!from || !to) issues.push({ id: `interface:${item.id}:open-end`, severity: "warning", category: "interface", title: `${item.interfaceCode} 仅关联单端 Tag`, detail: "如为外部边界应明确外部责任方；如为内部接口应补齐另一端 Tag。", entityType: "interfaces", entityId: item.id, systemId });
    const linked = [from, to].filter(Boolean) as EngineeringTag[];
    if (linked.some((tag) => mismatch(tag.medium, item.medium))) issues.push({ id: `interface:${item.id}:medium`, severity: "critical", category: "interface", title: `${item.interfaceCode} 介质定义冲突`, detail: `接口介质 ${item.medium} 与关联 Tag 不一致。`, entityType: "interfaces", entityId: item.id, systemId });
    const requiredPressure = Math.max(0, ...linked.map((tag) => Number(tag.designPressureMpa ?? 0)));
    if (requiredPressure > item.designPressureMpa) issues.push({ id: `interface:${item.id}:pressure`, severity: "critical", category: "interface", title: `${item.interfaceCode} 压力等级不足`, detail: `接口 ${item.designPressureMpa} MPa，低于关联 Tag 设计压力 ${requiredPressure} MPa。`, entityType: "interfaces", entityId: item.id, systemId });
    const requiredTemperature = Math.max(...linked.map((tag) => Number(tag.designTemperatureC ?? -273)));
    if (requiredTemperature > item.designTemperatureC) issues.push({ id: `interface:${item.id}:temperature`, severity: "critical", category: "interface", title: `${item.interfaceCode} 温度等级不足`, detail: `接口 ${item.designTemperatureC}°C，低于关联 Tag 设计温度 ${requiredTemperature}°C。`, entityType: "interfaces", entityId: item.id, systemId });
    if (!isClosed(item.status) && hazardousMedia.test(item.medium)) issues.push({ id: `interface:${item.id}:hazardous-open`, severity: "critical", category: "interface", title: `${item.interfaceCode} 危险介质接口未关闭`, detail: `${item.medium} 接口仍为 ${item.status}，需完成材料、泄漏、联锁和责任边界复核。`, entityType: "interfaces", entityId: item.id, systemId });
  }

  for (const item of input.bomItems) {
    if (!item.materialId && item.sourceType !== "calculation") issues.push({ id: `bom:${item.id}:material`, severity: "warning", category: "material", title: `${item.itemCode} 未绑定权威材料`, detail: "BOM 行只有文字规格，尚未关联材料主数据和品牌准入记录。", entityType: "bomItems", entityId: item.id, systemId: item.systemId ?? undefined });
    if (!item.sourceId) issues.push({ id: `bom:${item.id}:source`, severity: "warning", category: "material", title: `${item.itemCode} 缺少选型来源`, detail: "无法追溯到 Tag、接口、计算书或设备部件。", entityType: "bomItems", entityId: item.id, systemId: item.systemId ?? undefined });
  }

  for (const pack of input.testPacks) {
    if (pack.witnessRequired && isClosed(pack.status) && !pack.signedAt) issues.push({ id: `test:${pack.id}:signature`, severity: "critical", category: "test", title: `${pack.packNumber} 缺少见证签字`, detail: "见证必需的测试包已完成但没有签字时间，不能作为移交证据。", entityType: "testPacks", entityId: pack.id, systemId: pack.systemId ?? undefined });
  }

  for (const punch of input.punchItems) {
    if (punch.category.trim().toUpperCase() === "A" && !isClosed(punch.status)) issues.push({ id: `punch:${punch.id}:a-open`, severity: "critical", category: "punch", title: `${punch.punchNumber} 为 A 类未关闭项`, detail: punch.description, entityType: "punchItems", entityId: punch.id, systemId: punch.systemId ?? undefined });
  }

  for (const run of input.selectionRuns) {
    if (["blocked", "fatal", "failed"].includes(run.status.toLowerCase())) issues.push({ id: `selection:${run.id}:blocked`, severity: "critical", category: "material", title: "设备材料选型存在阻断", detail: `校验得分 ${run.score}，必须修正后重新提交。`, entityType: "selectionRuns", entityId: run.id });
  }

  const systemSummaries = input.systems.map((system) => {
    const systemTagIds = new Set(input.tags.filter((tag) => tag.systemId === system.id).map((tag) => tag.id));
    const systemInterfaces = input.interfaces.filter((item) => Boolean((item.fromTagId && systemTagIds.has(item.fromTagId)) || (item.toTagId && systemTagIds.has(item.toTagId))));
    const systemIssues = issues.filter((issue) => issue.systemId === system.id);
    const tests = input.testPacks.filter((pack) => pack.systemId === system.id);
    const completedTests = tests.filter((pack) => isClosed(pack.status)).length;
    const gates = [
      input.tags.some((tag) => tag.systemId === system.id),
      systemInterfaces.length > 0 && systemInterfaces.every((item) => isClosed(item.status)),
      input.bomItems.some((item) => item.systemId === system.id),
      tests.length > 0,
      !input.punchItems.some((item) => item.systemId === system.id && item.category.toUpperCase() === "A" && !isClosed(item.status)),
      system.designMaturity >= 80,
    ];
    return {
      ...system,
      tags: input.tags.filter((tag) => tag.systemId === system.id).length,
      interfaces: systemInterfaces.length,
      openInterfaces: systemInterfaces.filter((item) => !isClosed(item.status)).length,
      bomItems: input.bomItems.filter((item) => item.systemId === system.id).length,
      testPacks: tests.length,
      testCompletion: tests.length ? Math.round(completedTests / tests.length * 100) : 0,
      openPunches: input.punchItems.filter((item) => item.systemId === system.id && !isClosed(item.status)).length,
      criticalIssues: systemIssues.filter((issue) => issue.severity === "critical").length,
      warningIssues: systemIssues.filter((issue) => issue.severity === "warning").length,
      readiness: Math.round(gates.filter(Boolean).length / gates.length * 100),
    };
  });

  const openInterfaces = input.interfaces.filter((item) => !isClosed(item.status)).length;
  const completedTests = input.testPacks.filter((pack) => isClosed(pack.status)).length;
  const openPunches = input.punchItems.filter((item) => !isClosed(item.status));
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  const severityRank = { critical: 0, warning: 1, info: 2 } as const;
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      systems: input.systems.length,
      designMaturity: average(input.systems.map((system) => system.designMaturity)),
      interfaces: input.interfaces.length,
      openInterfaces,
      criticalInterfaces: issues.filter((issue) => issue.category === "interface" && issue.severity === "critical").length,
      testPacks: input.testPacks.length,
      testCompletion: input.testPacks.length ? Math.round(completedTests / input.testPacks.length * 100) : 0,
      openPunches: openPunches.length,
      classAPunches: openPunches.filter((item) => item.category.toUpperCase() === "A").length,
      readiness: average(systemSummaries.map((system) => system.readiness)),
      criticalIssues: issues.filter((issue) => issue.severity === "critical").length,
      warningIssues: issues.filter((issue) => issue.severity === "warning").length,
    },
    systems: systemSummaries,
    issues: issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
  };
}
