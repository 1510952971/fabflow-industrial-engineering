"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { downloadCsv, parseCsv } from "@/lib/client-actions";
import { getCurrentProjectId } from "@/lib/project-context";

type Notify = (message: string) => void;
type Row = Record<string, unknown> & { id?: string };
type Attachment = { id: string; fileName: string; category: string; version: number; sizeBytes: number; uploadedBy: string; createdAt: string; status?: string; signedBy?: string | null; signedAt?: string | null };
type FieldType = "text" | "number" | "textarea" | "select" | "relation" | "boolean" | "date" | "json";
type Field = {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  wide?: boolean;
  relation?: string;
  options?: string[];
  placeholder?: string;
  help?: string;
};
type EntityDefinition = {
  label: string;
  plural: string;
  icon: string;
  description: string;
  title: string[];
  subtitle: string[];
  fields: Field[];
  defaults?: Row;
};

const statusOptions = ["draft", "active", "released", "approved", "design", "open", "closed", "archived", "hold"];
const projectField: Field = { key: "projectId", label: "所属项目", type: "relation", relation: "projects", required: true };
const systemField: Field = { key: "systemId", label: "所属系统", type: "relation", relation: "systems" };
const modelField: Field = { key: "equipmentModelId", label: "设备型号", type: "relation", relation: "equipmentModels", required: true };

const definitions: Record<string, EntityDefinition> = {
  projects: {
    label: "项目", plural: "项目台账", icon: "⌂", description: "项目编码、厂区、阶段和状态的唯一入口", title: ["code", "name"], subtitle: ["fab", "phase", "status"],
    defaults: { region: "CN", fab: "FAB", phase: "detailed_design", status: "active" },
    fields: [
      { key: "code", label: "项目编号", required: true, placeholder: "FAB-2026-001" }, { key: "name", label: "项目名称", required: true, wide: true },
      { key: "region", label: "国家 / 地区", required: true }, { key: "fab", label: "厂区 / Fab", required: true },
      { key: "phase", label: "项目阶段", type: "select", options: ["concept", "basic_design", "detailed_design", "construction", "commissioning", "handover"] },
      { key: "status", label: "状态", type: "select", options: statusOptions },
    ],
  },
  systems: {
    label: "系统", plural: "系统分解", icon: "◫", description: "动力、洁净、纯废水、工艺排、消防、自控等系统主数据", title: ["code", "name"], subtitle: ["discipline", "status"],
    defaults: { designMaturity: 0, status: "design" },
    fields: [projectField, { key: "code", label: "系统编码", required: true }, { key: "name", label: "系统名称", required: true, wide: true },
      { key: "discipline", label: "专业", required: true, placeholder: "UPW / HVAC / FIRE / CTRL" }, { key: "ownerEmail", label: "系统负责人" },
      { key: "designMaturity", label: "设计成熟度 %", type: "number", required: true }, { key: "status", label: "状态", type: "select", options: statusOptions }],
  },
  tags: {
    label: "Tag", plural: "Tag 台账", icon: "◎", description: "设备、管线、阀门、仪表统一 Tag 编码", title: ["tagNo", "description"], subtitle: ["entityType", "medium", "status"],
    defaults: { status: "draft" },
    fields: [projectField, { ...systemField, required: true }, { key: "tagNo", label: "Tag 编号", required: true },
      { key: "entityType", label: "对象类型", type: "select", options: ["equipment", "line", "valve", "instrument", "panel", "terminal"], required: true },
      { key: "description", label: "描述", wide: true }, { key: "medium", label: "介质" }, { key: "designPressureMpa", label: "设计压力 MPa", type: "number" },
      { key: "designTemperatureC", label: "设计温度 °C", type: "number" }, { key: "status", label: "状态", type: "select", options: statusOptions }],
  },
  interfaces: {
    label: "接口", plural: "接口台账", icon: "⑂", description: "设备厂与厂务系统连接条件、尺寸和责任边界", title: ["interfaceCode", "medium"], subtitle: ["connectionStandard", "nominalSize", "status"],
    defaults: { cleanlinessGrade: "industrial", status: "open" },
    fields: [projectField, { key: "interfaceCode", label: "接口编号", required: true },
      { key: "fromTagId", label: "起点 Tag", type: "relation", relation: "tags" }, { key: "toTagId", label: "终点 Tag", type: "relation", relation: "tags" },
      { key: "medium", label: "介质", required: true }, { key: "connectionStandard", label: "连接标准", required: true, placeholder: "VCR / ASME B16.5 / DIN" },
      { key: "nominalSize", label: "公称尺寸", required: true }, { key: "designPressureMpa", label: "设计压力 MPa", type: "number", required: true },
      { key: "designTemperatureC", label: "设计温度 °C", type: "number", required: true }, { key: "cleanlinessGrade", label: "洁净等级", required: true },
      { key: "ownerDiscipline", label: "责任专业", required: true }, { key: "status", label: "状态", type: "select", options: statusOptions }],
  },
  materials: {
    label: "材料", plural: "材料数据库", icon: "◇", description: "制造商、牌号、洁净度、压力温度能力和认证", title: ["code", "name"], subtitle: ["manufacturer", "grade", "status"],
    defaults: { certificationsJson: "", status: "approved" },
    fields: [{ key: "manufacturer", label: "制造商 / 品牌", required: true }, { key: "code", label: "材料编码", required: true }, { key: "name", label: "材料名称", required: true, wide: true },
      { key: "grade", label: "牌号", required: true }, { key: "baseMaterial", label: "基材", required: true }, { key: "surfaceFinish", label: "表面处理", required: true },
      { key: "cleanlinessGrade", label: "洁净等级", required: true }, { key: "maxPressureMpa", label: "最高压力 MPa", type: "number", required: true },
      { key: "minTemperatureC", label: "最低温度 °C", type: "number", required: true }, { key: "maxTemperatureC", label: "最高温度 °C", type: "number", required: true },
      { key: "certificationsJson", label: "认证 / 标准", type: "json", wide: true, help: "用逗号分隔，例如 SEMI F20, ASTM A269" }, { key: "status", label: "状态", type: "select", options: statusOptions }],
  },
  materialCompatibility: {
    label: "兼容规则", plural: "介质兼容", icon: "✓", description: "介质—材料兼容矩阵和限制条件", title: ["medium", "materialGrade"], subtitle: ["rating", "sourceStandard"],
    fields: [{ key: "medium", label: "介质", required: true }, { key: "materialGrade", label: "材料牌号", required: true },
      { key: "rating", label: "兼容等级", type: "select", options: ["recommended", "acceptable", "conditional", "prohibited"], required: true },
      { key: "maxConcentrationPct", label: "最高浓度 %", type: "number" }, { key: "maxTemperatureC", label: "最高温度 °C", type: "number" },
      { key: "sourceStandard", label: "依据标准", required: true }, { key: "notes", label: "限制与说明", type: "textarea", wide: true }],
  },
  equipmentFactories: {
    label: "设备工厂", plural: "设备厂", icon: "▣", description: "设备供应商与质量准入状态", title: ["code", "name"], subtitle: ["country", "qualityStatus"],
    defaults: { qualityStatus: "qualified" },
    fields: [{ key: "code", label: "工厂编码", required: true }, { key: "name", label: "工厂名称", required: true, wide: true }, { key: "country", label: "国家", required: true },
      { key: "contactEmail", label: "技术接口人邮箱" }, { key: "qualityStatus", label: "质量状态", type: "select", options: ["qualified", "conditional", "pending", "blocked"] }],
  },
  equipmentModels: {
    label: "设备型号", plural: "设备型号", icon: "▥", description: "设备厂型号、版本和设计标准", title: ["code", "name"], subtitle: ["category", "revision", "status"],
    defaults: { revision: "A", status: "released" },
    fields: [{ key: "factoryId", label: "设备工厂", type: "relation", relation: "equipmentFactories", required: true }, { key: "code", label: "型号编码", required: true },
      { key: "name", label: "型号名称", required: true, wide: true }, { key: "category", label: "设备分类", required: true }, { key: "revision", label: "版本", required: true },
      { key: "designStandard", label: "设计标准", required: true, wide: true }, { key: "status", label: "状态", type: "select", options: statusOptions }],
  },
  equipmentComponents: {
    label: "内部材料", plural: "设备内部材料", icon: "⌁", description: "设备内部零部件、接液材质与工况要求", title: ["componentCode", "componentName"], subtitle: ["medium", "criticality"],
    defaults: { quantity: 1, criticality: "B", allowedMaterialsJson: "" },
    fields: [modelField, { key: "componentCode", label: "部件编码", required: true }, { key: "componentName", label: "部件名称", required: true, wide: true },
      { key: "function", label: "功能", required: true }, { key: "medium", label: "接触介质", required: true }, { key: "allowedMaterialsJson", label: "允许材质", type: "json", required: true, wide: true, help: "用逗号分隔多个牌号" },
      { key: "requiredFinish", label: "表面处理要求", required: true }, { key: "requiredCleanliness", label: "洁净要求", required: true },
      { key: "designPressureMpa", label: "设计压力 MPa", type: "number", required: true }, { key: "designTemperatureC", label: "设计温度 °C", type: "number", required: true },
      { key: "connectionStandard", label: "连接标准", required: true }, { key: "nominalSize", label: "公称尺寸", required: true }, { key: "quantity", label: "单机数量", type: "number", required: true },
      { key: "criticality", label: "关键等级", type: "select", options: ["A", "B", "C"], required: true }],
  },
  equipmentPorts: {
    label: "设备接口", plural: "设备接口", icon: "⊞", description: "设备 Nozzle / Hook-up 接口条件核对", title: ["portCode", "service"], subtitle: ["direction", "connectionStandard", "nominalSize"],
    fields: [modelField, { key: "portCode", label: "接口编号", required: true }, { key: "service", label: "服务 / 介质", required: true },
      { key: "direction", label: "方向", type: "select", options: ["inlet", "outlet", "bidirectional", "vent", "drain"], required: true },
      { key: "connectionStandard", label: "连接标准", required: true }, { key: "nominalSize", label: "公称尺寸", required: true },
      { key: "pressureRatingMpa", label: "额定压力 MPa", type: "number", required: true }, { key: "temperatureRatingC", label: "额定温度 °C", type: "number", required: true },
      { key: "faceToFaceMm", label: "接口基准距离 mm", type: "number" }],
  },
  technicalRules: {
    label: "技术规则", plural: "技术文件规则", icon: "▤", description: "从招标技术文件形成的结构化选型规则", title: ["ruleCode", "serviceName"], subtitle: ["packageCode", "systemCode", "status"],
    defaults: { mediumCodesJson: "", nominalSizesJson: "", flexibleTubePolicy: "allowed", doubleContainment: false, status: "active" },
    fields: [{ key: "ruleCode", label: "规则编码", required: true }, { key: "packageCode", label: "包件编码", required: true }, { key: "systemCode", label: "系统编码", required: true },
      { key: "serviceName", label: "服务名称", required: true, wide: true }, { key: "mediumCodesJson", label: "介质代码", type: "json", required: true, wide: true },
      { key: "approvalRuleCode", label: "关联品牌规则" }, { key: "requiredGrade", label: "材质牌号要求", required: true }, { key: "requiredFinish", label: "表面处理要求", required: true },
      { key: "fittingStandard", label: "管件标准", required: true }, { key: "valveType", label: "阀门类型", required: true },
      { key: "flexibleTubePolicy", label: "软管策略", type: "select", options: ["allowed", "restricted", "prohibited"] }, { key: "doubleContainment", label: "要求双层管", type: "boolean" },
      { key: "nominalSizesJson", label: "适用规格", type: "json", wide: true }, { key: "restrictions", label: "限制条件", type: "textarea", wide: true },
      { key: "sourceDocument", label: "来源文件", required: true, wide: true }, { key: "sourcePages", label: "来源页码", required: true }, { key: "sourceClause", label: "来源条款", required: true },
      { key: "status", label: "状态", type: "select", options: statusOptions }],
  },
  brandRules: {
    label: "品牌规则", plural: "品牌报审规则", icon: "♢", description: "品牌白名单、牌号和限制条件", title: ["ruleCode", "itemName"], subtitle: ["categoryCode", "requiredGrade", "status"],
    defaults: { allowedBrandsJson: "", status: "approved" },
    fields: [{ key: "ruleCode", label: "规则编码", required: true }, { key: "packageCode", label: "包件编码", required: true }, { key: "categoryCode", label: "品类编码", required: true },
      { key: "itemName", label: "材料 / 设备名称", required: true, wide: true }, { key: "requiredGrade", label: "要求牌号", required: true },
      { key: "allowedBrandsJson", label: "允许品牌", type: "json", required: true, wide: true, help: "用逗号分隔多个品牌" }, { key: "restrictions", label: "限制条件", type: "textarea", wide: true },
      { key: "sourceDocument", label: "来源文件", required: true, wide: true }, { key: "sourcePage", label: "来源页码", required: true }, { key: "status", label: "状态", type: "select", options: statusOptions }],
  },
  bomItems: {
    label: "BOM", plural: "项目 BOM", icon: "▤", description: "选型、计算和人工录入形成的可追溯物料清单", title: ["itemCode", "itemName"], subtitle: ["specification", "quantity", "unit", "status"],
    defaults: { quantity: 1, unit: "件", unitPriceCny: 0, wastePct: 5, sourceType: "manual", status: "draft" },
    fields: [projectField, systemField, { key: "materialId", label: "关联材料", type: "relation", relation: "materials" }, { key: "itemCode", label: "物料编码", required: true },
      { key: "itemName", label: "物料名称", required: true, wide: true }, { key: "specification", label: "规格 / 材质", wide: true }, { key: "quantity", label: "设计数量", type: "number", required: true },
      { key: "unit", label: "单位", required: true }, { key: "unitPriceCny", label: "含税单价 CNY", type: "number" }, { key: "wastePct", label: "采购余量 %", type: "number" },
      { key: "sourceType", label: "来源", type: "select", options: ["manual", "catalog", "calculation", "equipment", "import"] }, { key: "sourceId", label: "来源记录 ID" },
      { key: "status", label: "状态", type: "select", options: statusOptions }],
  },
  purchaseOrders: {
    label: "采购订单", plural: "采购订单", icon: "◷", description: "PO、供应商、承诺日期和同步来源", title: ["poNumber", "supplier"], subtitle: ["packageCode", "amountCny", "status"],
    defaults: { amountCny: 0, status: "placed", sourceSystem: "manual" },
    fields: [projectField, { key: "poNumber", label: "PO 编号", required: true }, { key: "supplier", label: "供应商", required: true, wide: true },
      { key: "packageCode", label: "包件编码", required: true }, { key: "amountCny", label: "订单金额 CNY", type: "number" }, { key: "promisedDate", label: "承诺到货日", type: "date" },
      { key: "status", label: "状态", type: "select", options: ["placed", "confirmed", "manufacturing", "shipped", "received", "closed", "hold"] },
      { key: "sourceSystem", label: "来源系统" }, { key: "externalId", label: "外部系统 ID" }],
  },
  testPacks: {
    label: "测试包", plural: "测试包", icon: "✓", description: "试压、冲洗、联调和见证签字状态", title: ["packNumber", "title"], subtitle: ["testType", "status"],
    defaults: { status: "draft", witnessRequired: false },
    fields: [projectField, systemField, { key: "packNumber", label: "测试包编号", required: true }, { key: "title", label: "测试包名称", required: true, wide: true },
      { key: "testType", label: "测试类型", type: "select", options: ["pressure", "leak", "flushing", "purity", "functional", "integrated"], required: true },
      { key: "witnessRequired", label: "需要见证", type: "boolean" }, { key: "signedAt", label: "签字时间", type: "date" }, { key: "status", label: "状态", type: "select", options: statusOptions }],
  },
  punchItems: {
    label: "Punch", plural: "Punch 清单", icon: "!", description: "现场缺陷、责任人、到期日和关闭状态", title: ["punchNumber", "description"], subtitle: ["category", "ownerEmail", "status"],
    defaults: { status: "open" },
    fields: [projectField, systemField, { key: "punchNumber", label: "Punch 编号", required: true }, { key: "category", label: "等级", type: "select", options: ["A", "B", "C"], required: true },
      { key: "description", label: "问题描述", type: "textarea", required: true, wide: true }, { key: "ownerEmail", label: "责任人" },
      { key: "dueDate", label: "要求完成日", type: "date" }, { key: "closedAt", label: "实际关闭日", type: "date" }, { key: "status", label: "状态", type: "select", options: ["open", "in_progress", "ready_for_verification", "closed", "rejected"] }],
  },
  managementOfChanges: {
    label: "MOC 变更", plural: "MOC 变更台账", icon: "△", description: "技术变更、影响、责任人和审批状态的权威记录", title: ["mocNumber", "title"], subtitle: ["riskLevel", "status"],
    defaults: { riskLevel: "medium", costImpactCny: 0, scheduleImpactDays: 0, status: "draft" },
    fields: [projectField, systemField, { key: "mocNumber", label: "MOC 编号", required: true }, { key: "title", label: "变更标题", required: true, wide: true },
      { key: "reason", label: "变更原因", type: "textarea", required: true, wide: true }, { key: "riskLevel", label: "风险等级", type: "select", options: ["low", "medium", "high", "critical"], required: true },
      { key: "costImpactCny", label: "成本影响 CNY", type: "number" }, { key: "scheduleImpactDays", label: "工期影响 天", type: "number" }, { key: "ownerEmail", label: "责任人" },
      { key: "status", label: "状态", type: "select", options: ["draft", "impact_review", "pending_approval", "approved", "executing", "closed", "rejected"] }],
  },
  constructionWorkPackages: {
    label: "施工工作包", plural: "CWP / IWP 台账", icon: "▣", description: "施工边界、作业面、责任人、计划时间和放行条件", title: ["packageNumber", "title"], subtitle: ["area", "status"],
    defaults: { readinessJson: "{}", status: "draft" },
    fields: [projectField, systemField, { key: "packageNumber", label: "工作包编号", required: true }, { key: "title", label: "工作包名称", required: true, wide: true },
      { key: "area", label: "施工区域", required: true }, { key: "ownerEmail", label: "负责人" }, { key: "plannedStart", label: "计划开工", type: "date" },
      { key: "readinessJson", label: "放行条件 JSON", type: "json", wide: true }, { key: "status", label: "状态", type: "select", options: ["draft", "constraints", "ready", "released", "executing", "completed", "closed"] }],
  },
  workflowActions: {
    label: "工作流动作", plural: "行动与会议台账", icon: "✓", description: "会议、催办、评审、签发和跨专业动作的持久化记录", title: ["actionType", "title"], subtitle: ["assignedTo", "status"],
    defaults: { actionType: "task", status: "open", requestedBy: "ui" },
    fields: [projectField, { key: "actionType", label: "动作类型", required: true }, { key: "title", label: "动作标题", required: true, wide: true },
      { key: "entityType", label: "关联对象类型" }, { key: "entityId", label: "关联对象 ID" }, { key: "assignedTo", label: "责任人" }, { key: "dueAt", label: "到期时间", type: "date" },
      { key: "payloadJson", label: "补充信息 JSON", type: "json", wide: true }, { key: "requestedBy", label: "发起人", required: true }, { key: "completedAt", label: "完成时间", type: "date" },
      { key: "status", label: "状态", type: "select", options: ["open", "in_progress", "completed", "closed", "cancelled"] }],
  },
};

const groups = [
  { id: "engineering", label: "项目与系统", entities: ["projects", "systems", "tags", "interfaces"] },
  { id: "equipment", label: "设备工厂", entities: ["equipmentFactories", "equipmentModels", "equipmentComponents", "equipmentPorts"] },
  { id: "rules", label: "材料与规则", entities: ["materials", "materialCompatibility", "technicalRules", "brandRules"] },
  { id: "delivery", label: "采购与交付", entities: ["bomItems", "purchaseOrders", "testPacks", "punchItems", "managementOfChanges", "constructionWorkPackages", "workflowActions"] },
];

const entityKeys = Object.keys(definitions);

function displayJson(value: unknown) {
  if (typeof value !== "string") return value ?? "";
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join(", ") : JSON.stringify(parsed);
  } catch { return value; }
}

function labelFor(row: Row, definition: EntityDefinition) {
  const parts = definition.title.map((key) => row[key]).filter((value) => value !== null && value !== undefined && value !== "");
  return parts.join(" · ") || "未命名记录";
}

function relationLabel(entity: string, row: Row) {
  const def = definitions[entity];
  return def ? labelFor(row, def) : String(row.id ?? "");
}

export function MasterDataPage({ notify }: { notify: Notify }) {
  const [records, setRecords] = useState<Record<string, Row[]>>({});
  const [activeEntity, setActiveEntity] = useState("projects");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [baseline, setBaseline] = useState<Row>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [identity, setIdentity] = useState("");
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);

  const definition = definitions[activeEntity];
  const filteredRows = useMemo(() => {
    const rows = records[activeEntity] ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
  }, [query, records, activeEntity]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  const readError = async (response: Response) => {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    return payload.error || `请求失败（${response.status}）`;
  };

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/master-data?entities=${entityKeys.join(",")}&projectId=${encodeURIComponent(getCurrentProjectId())}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json() as { data: Record<string, Row[]>; permissions?: { canWrite?: boolean }; principal?: { displayName?: string; email?: string } };
      setRecords(payload.data ?? {});
      setCanWrite(Boolean(payload.permissions?.canWrite));
      setIdentity(payload.principal?.displayName || payload.principal?.email || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "主数据加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const target = window.sessionStorage.getItem("fabflow:master-entity");
    const targetQuery = window.sessionStorage.getItem("fabflow:master-query");
    if (target && definitions[target]) window.setTimeout(() => setActiveEntity(target), 0);
    if (targetQuery) window.setTimeout(() => setQuery(targetQuery), 50);
    window.sessionStorage.removeItem("fabflow:master-entity");
    window.sessionStorage.removeItem("fabflow:master-query");
    window.setTimeout(() => void load(), 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const makeNew = () => {
    const next: Row = { ...(definition.defaults ?? {}) };
    if (definition.fields.some((field) => field.key === "projectId")) next.projectId = getCurrentProjectId();
    for (const field of definition.fields) {
      if (field.type === "relation" && field.required && field.relation && !(field.key in next)) next[field.key] = records[field.relation]?.[0]?.id ?? "";
    }
    setSelectedId(null); setDraft(next); setBaseline(next); setAttachments([]); setError("");
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { setQuery(""); makeNew(); }, [activeEntity]);

  const projectIdForRow = (row: Row, id?: string | null) => String(row.projectId || (activeEntity === "projects" ? id : "") || getCurrentProjectId());

  const loadAttachments = async (id: string, row: Row) => {
    try {
      const projectId = projectIdForRow(row, id);
      const response = await fetch(`/api/files?projectId=${encodeURIComponent(projectId)}&entityType=${encodeURIComponent(activeEntity)}&entityId=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json() as { files?: Attachment[] };
      setAttachments(payload.files ?? []);
    } catch { setAttachments([]); }
  };

  const selectRow = (row: Row) => {
    const editable: Row = {};
    for (const field of definition.fields) editable[field.key] = field.type === "json" ? displayJson(row[field.key]) : row[field.key] ?? "";
    window.sessionStorage.removeItem("fabflow:master-navigation");
    const id = String(row.id);
    setSelectedId(id); setDraft(editable); setBaseline(editable); setError("");
    void loadAttachments(id, row);
  };

  const updateField = (field: Field, value: unknown) => setDraft((current) => ({ ...current, [field.key]: value }));

  const validate = () => {
    const missing = definition.fields.filter((field) => field.required && (draft[field.key] === "" || draft[field.key] === null || draft[field.key] === undefined));
    if (missing.length) return `请填写：${missing.map((field) => field.label).join("、")}`;
    return "";
  };

  const save = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    if (!canWrite) { setError("当前账号是只读角色，需由管理员授予项目经理、系统负责人或设备工程师角色"); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/master-data", {
        method: selectedId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: activeEntity, id: selectedId, data: draft }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json() as { item: Row };
      setRecords((current) => {
        const existing = current[activeEntity] ?? [];
        return { ...current, [activeEntity]: selectedId ? existing.map((row) => row.id === selectedId ? payload.item : row) : [payload.item, ...existing] };
      });
      selectRow(payload.item);
      notify(`${definition.label}${selectedId ? "已更新" : "已创建"}，审计日志已记录`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!selectedId || !canWrite) return;
    if (!window.confirm(`确认归档这条${definition.label}记录？归档后可从版本历史恢复。`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/master-data", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: activeEntity, id: selectedId }) });
      if (!response.ok) throw new Error(await readError(response));
      setRecords((current) => ({ ...current, [activeEntity]: (current[activeEntity] ?? []).filter((row) => row.id !== selectedId) }));
      makeNew(); notify(`${definition.label}已归档，版本快照与审计日志已记录`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "删除失败"); }
    finally { setSaving(false); }
  };

  const downloadTemplate = () => {
    downloadCsv(`${activeEntity}-import-template.csv`, definition.fields.map((field) => field.label), [definition.fields.map((field) => definition.defaults?.[field.key] ?? "")]);
    notify(`${definition.label}批量导入模板已下载`);
  };

  const importRecords = async (file: File) => {
    if (!canWrite) { setError("当前账号没有批量导入权限"); return; }
    setSaving(true); setError("");
    try {
      const text = await file.text();
      let items: Row[];
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text) as unknown;
        if (!Array.isArray(parsed)) throw new Error("JSON 根节点必须是数组");
        items = parsed as Row[];
      } else {
        const matrix = parseCsv(text);
        if (matrix.length < 2) throw new Error("CSV 必须包含表头和至少一行数据");
        const headers = matrix[0].map((heading) => definition.fields.find((field) => field.key === heading || field.label === heading)?.key ?? "");
        items = matrix.slice(1).map((cells) => Object.fromEntries(headers.map((key, index) => [key, cells[index] ?? ""]).filter(([key]) => key)));
      }
      if (!items.length) throw new Error("没有可导入的数据");
      const response = await fetch("/api/master-data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: activeEntity, items }) });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json() as { items: Row[]; imported: number };
      setRecords((current) => ({ ...current, [activeEntity]: [...payload.items, ...(current[activeEntity] ?? [])] }));
      notify(`已导入 ${payload.imported} 条${definition.label}记录，审计日志已生成`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "批量导入失败"); }
    finally { setSaving(false); if (importInput.current) importInput.current.value = ""; }
  };

  const uploadAttachment = async (file: File) => {
    if (!selectedId || !canWrite) { setError("请先保存并选中一条记录，再上传附件"); return; }
    setUploading(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("projectId", projectIdForRow(draft, selectedId));
      form.append("entityType", activeEntity);
      form.append("entityId", selectedId);
      form.append("category", ["technicalRules", "brandRules"].includes(activeEntity) ? "source_document" : "evidence");
      const response = await fetch("/api/files", { method: "POST", body: form });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json() as { file: Attachment };
      setAttachments((current) => [payload.file, ...current]);
      notify(`${payload.file.fileName} 已保存到 R2，并关联当前${definition.label}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "附件上传失败"); }
    finally { setUploading(false); if (attachmentInput.current) attachmentInput.current.value = ""; }
  };
  const downloadAttachment = (file: Attachment) => {
    const projectId = projectIdForRow(draft, selectedId);
    const anchor = document.createElement("a");
    anchor.href = "/api/files?projectId=" + encodeURIComponent(projectId) + "&download=" + encodeURIComponent(file.id);
    anchor.click();
  };

  const signAttachment = async (file: Attachment) => {
    if (!canWrite) return;
    setUploading(true); setError("");
    try {
      const response = await fetch("/api/files", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: file.id, action: "sign" }) });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json() as { file: Attachment };
      setAttachments((current) => current.map((item) => item.id === file.id ? payload.file : item));
      notify(file.fileName + " 已签署并写入审计日志");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "附件签署失败"); }
    finally { setUploading(false); }
  };


  return <>
    <div className="masterTop">
      <div><span>AUTHORITATIVE DATA ENTRY</span><h2>工程主数据录入中心</h2><p>项目 → 系统 → Tag / 接口 → 设备与材料 → BOM / 测试包 / Punch，一处录入、全程留痕</p></div>
      <div className={`masterAccess ${canWrite ? "write" : "readonly"}`}><i>{canWrite ? "✓" : "◌"}</i><span><b>{canWrite ? "可编辑" : "只读访问"}</b><small>{identity || "等待工作区身份"}</small></span></div>
    </div>

    <div className="masterStats">
      {groups.map((group) => <section className="card" key={group.id}><span>{group.label}</span><b>{group.entities.reduce((sum, entity) => sum + (records[entity]?.length ?? 0), 0)}</b><small>{group.entities.map((entity) => `${definitions[entity].label} ${records[entity]?.length ?? 0}`).join(" · ")}</small></section>)}
    </div>

    {error && <div className="masterError"><i>!</i><span><b>需要处理</b><small>{error}</small></span><button onClick={() => setError("")}>×</button></div>}

    <div className="masterShell">
      <aside className="card masterNav">
        {groups.map((group) => <div key={group.id}><span>{group.label}</span>{group.entities.map((entity) => <button key={entity} className={activeEntity === entity ? "active" : ""} onClick={() => { if (!dirty || window.confirm("当前修改尚未保存，确认切换？")) setActiveEntity(entity); }}><i>{definitions[entity].icon}</i><b>{definitions[entity].label}</b><em>{records[entity]?.length ?? 0}</em></button>)}</div>)}
      </aside>

      <section className="card masterList">
        <div className="masterListHead"><div><span>{definition.plural}</span><h3>{definition.description}</h3></div><div><button onClick={downloadTemplate}>模板</button><button disabled={!canWrite} onClick={() => importInput.current?.click()}>导入</button><button disabled={!canWrite} onClick={makeNew}>＋ 新增</button><input ref={importInput} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(event) => event.target.files?.[0] && void importRecords(event.target.files[0])}/></div></div>
        <label className="masterSearch">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${definition.label}…`} /><kbd>{filteredRows.length}</kbd></label>
        <div className="masterRows">{loading ? <div className="masterEmpty"><i className="skeleton"/><i className="skeleton"/><i className="skeleton"/></div> : filteredRows.length ? filteredRows.map((row) => <button key={row.id} className={selectedId === row.id ? "active" : ""} onClick={() => selectRow(row)}><i>{definition.icon}</i><span><b>{labelFor(row, definition)}</b><small>{definition.subtitle.map((key) => row[key]).filter(Boolean).join(" · ") || "暂无辅助信息"}</small></span><em>›</em></button>) : <div className="masterEmpty"><i>＋</i><b>还没有{definition.label}记录</b><small>{canWrite ? "点击“新增”建立第一条权威数据" : "当前账号没有写入权限"}</small></div>}</div>
      </section>

      <section className="card masterEditor">
        <div className="masterEditorHead"><div><span>{selectedId ? "EDIT RECORD" : "NEW RECORD"}</span><h3>{selectedId ? `编辑${definition.label}` : `新增${definition.label}`}</h3><p>{dirty ? "有未保存修改" : selectedId ? "当前记录已同步到 D1" : "填写必填字段后保存"}</p></div>{selectedId && <code>{selectedId.slice(0, 8)}</code>}</div>
        <div className="masterForm">{definition.fields.map((field) => {
          const value = draft[field.key] ?? "";
          const className = field.wide ? "wide" : "";
          if (field.type === "boolean") return <label className={`masterToggle ${className}`} key={field.key}><span><b>{field.label}</b><small>{field.help || "开关状态会写入权威数据"}</small></span><input type="checkbox" checked={Boolean(value)} disabled={!canWrite} onChange={(event) => updateField(field, event.target.checked)} /><i/></label>;
          if (field.type === "relation") {
            const options = records[field.relation ?? ""] ?? [];
            return <label className={className} key={field.key}><span>{field.label}{field.required && <b>*</b>}</span><select value={String(value)} disabled={!canWrite} onChange={(event) => updateField(field, event.target.value)}><option value="">{options.length ? "请选择" : "请先建立上级数据"}</option>{options.map((row) => <option value={row.id} key={row.id}>{relationLabel(field.relation ?? "", row)}</option>)}</select></label>;
          }
          if (field.type === "select") return <label className={className} key={field.key}><span>{field.label}{field.required && <b>*</b>}</span><select value={String(value)} disabled={!canWrite} onChange={(event) => updateField(field, event.target.value)}><option value="">请选择</option>{field.options?.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
          if (field.type === "textarea") return <label className={className} key={field.key}><span>{field.label}{field.required && <b>*</b>}</span><textarea value={String(value)} disabled={!canWrite} placeholder={field.placeholder} onChange={(event) => updateField(field, event.target.value)} />{field.help && <small>{field.help}</small>}</label>;
          return <label className={className} key={field.key}><span>{field.label}{field.required && <b>*</b>}</span><input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} step={field.type === "number" ? "any" : undefined} value={String(value)} disabled={!canWrite} placeholder={field.placeholder} onChange={(event) => updateField(field, event.target.value)} />{field.help && <small>{field.help}</small>}</label>;
        })}</div>
        {selectedId && <div className="masterAttachments"><div><span>R2 关联附件</span><b>{attachments.length} 份文件</b></div><div className="masterAttachmentList">{attachments.slice(0, 6).map((file) => <div key={file.id}><span><i>▧</i><b>{file.fileName}</b><small>v{file.version} · {(file.sizeBytes / 1024).toFixed(1)} KB · {file.status === "signed" ? "已签署" : "有效"}</small></span><button onClick={() => downloadAttachment(file)}>下载</button><button disabled={!canWrite || uploading || file.status === "signed"} onClick={() => void signAttachment(file)}>{file.status === "signed" ? "已签署" : "签署"}</button></div>)}{!attachments.length && <small>暂无附件，可上传技术文件、品牌表、图纸、计算书或签字记录</small>}</div><button disabled={!canWrite || uploading} onClick={() => attachmentInput.current?.click()}>{uploading ? "上传中…" : "＋ 上传附件"}</button><input ref={attachmentInput} type="file" hidden onChange={(event) => event.target.files?.[0] && void uploadAttachment(event.target.files[0])}/></div>}
        <div className="masterActions"><button className="danger" disabled={!selectedId || !canWrite || saving} onClick={remove}>归档记录</button><span>{dirty ? "● 尚未保存" : "✓ 无待保存修改"}</span><button className="soft" disabled={saving || !dirty} onClick={() => setDraft(baseline)}>撤销</button><button className="primaryButton" disabled={!canWrite || saving || !dirty} onClick={save}>{saving ? "保存中…" : selectedId ? "保存修改" : "创建记录"}</button></div>
      </section>
    </div>
  </>;
}
