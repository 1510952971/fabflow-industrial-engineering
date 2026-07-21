"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { downloadCsv } from "@/lib/client-actions";
import { getCurrentProjectId } from "@/lib/project-context";

type Notify = (message: string) => void;
type Connector = {
  id: string; sourceSystem: string; displayName: string; mode: string; endpointUrl: string | null;
  adapterProfile: string; authType: string; credentialRef: string | null; fieldMappingJson: string;
  inboundAllowlistJson: string; healthcheckPath: string | null; timeoutMs: number; cursor: string | null;
  status: string; enabled: boolean; lastSuccessAt: string | null; lastError: string | null; verifiedAt: string | null;
};
type SyncRun = { id: string; connectorId: string; runType: string; status: string; recordsRead: number; recordsWritten: number; recordsFailed: number; errorMessage: string | null; startedAt: string; finishedAt: string | null };
type EventRow = { id: string; sourceSystem: string; eventType: string; status: string; retryCount: number; receivedAt: string };
type Source = { id: string; name: string; owner: string; mode: string; adapter: string };

const sources: Source[] = [
  { id: "ERP", name: "ERP / 采购订单", owner: "采购与供应链", mode: "REST + 增量游标", adapter: "erp_po" },
  { id: "SCHED", name: "Primavera / MS Project", owner: "项目控制", mode: "REST / 中间库", adapter: "schedule_milestone" },
  { id: "QMS", name: "QMS / ITP、试验包与 Punch", owner: "QA/QC", mode: "REST / Webhook", adapter: "qms_test_pack" },
  { id: "VENDOR", name: "设备厂 API / 供应商门户", owner: "设备与采购", mode: "REST / Webhook", adapter: "vendor_equipment_model" },
  { id: "BMS", name: "BMS / I/O 与报警", owner: "机电自控", mode: "API / 事件网关", adapter: "bms_event" },
  { id: "EPMS", name: "EPMS / 电力与能耗", owner: "电气与能源", mode: "API / 时序事件", adapter: "epms_event" },
  { id: "SCADA", name: "SCADA / 工艺运行趋势", owner: "自控与运营", mode: "API / 事件网关", adapter: "scada_event" },
];

const adapterOptions = [
  ["erp_po", "ERP 采购订单"], ["qms_test_pack", "QMS 试验包"], ["qms_punch", "QMS Punch"],
  ["schedule_milestone", "计划里程碑"], ["vendor_equipment_model", "设备厂型号"],
  ["vendor_equipment_component", "设备内部部件"], ["bms_event", "BMS 运行事件"],
  ["epms_event", "EPMS 运行事件"], ["scada_event", "SCADA 运行事件"],
];

const mappingFields: Record<string, Record<string, string>> = {
  erp_po: { poNumber: "poNumber", supplier: "supplier", packageCode: "packageCode", amountCny: "amountCny", promisedDate: "promisedDate", status: "status" },
  qms_test_pack: { packNumber: "packNumber", title: "title", testType: "testType", status: "status", systemId: "systemId", witnessRequired: "witnessRequired", signedAt: "signedAt" },
  qms_punch: { punchNumber: "punchNumber", category: "category", description: "description", status: "status", systemId: "systemId", ownerEmail: "ownerEmail", dueDate: "dueDate" },
  schedule_milestone: { name: "name", dueAt: "dueAt", status: "status", owner: "owner" },
  vendor_equipment_model: { factoryCode: "factoryCode", factoryName: "factoryName", code: "code", name: "name", category: "category", revision: "revision", designStandard: "designStandard", status: "status" },
  vendor_equipment_component: { modelCode: "modelCode", componentCode: "componentCode", componentName: "componentName", function: "function", medium: "medium", allowedMaterials: "allowedMaterials", connectionStandard: "connectionStandard", nominalSize: "nominalSize" },
  bms_event: { tagNo: "tagNo", occurredAt: "occurredAt", severity: "severity", value: "value", unit: "unit", quality: "quality" },
  epms_event: { tagNo: "tagNo", occurredAt: "occurredAt", severity: "severity", value: "value", unit: "unit", quality: "quality" },
  scada_event: { tagNo: "tagNo", occurredAt: "occurredAt", severity: "severity", value: "value", unit: "unit", quality: "quality" },
};

const eventTypes: Record<string, string> = {
  erp_po: "erp.po.upsert", qms_test_pack: "qms.test_pack.upsert", qms_punch: "qms.punch.upsert",
  schedule_milestone: "schedule.milestone.upsert", vendor_equipment_model: "vendor.equipment_model.upsert",
  vendor_equipment_component: "vendor.equipment_component.upsert", bms_event: "bms.telemetry.upsert",
  epms_event: "epms.telemetry.upsert", scada_event: "scada.telemetry.upsert",
};

type Draft = { sourceSystem: string; displayName: string; mode: string; endpointUrl: string; adapterProfile: string; authType: string; credentialRef: string; healthcheckPath: string; timeoutMs: number; inboundAllowlist: string; mapping: string };

function draftFor(source: Source, connector?: Connector): Draft {
  const adapter = connector?.adapterProfile ?? source.adapter;
  let allowlist = "";
  try { allowlist = JSON.parse(connector?.inboundAllowlistJson ?? "[]").join("\n"); } catch { /* Keep empty. */ }
  const mapping = connector?.fieldMappingJson && connector.fieldMappingJson !== "{}" ? connector.fieldMappingJson : JSON.stringify({ eventType: eventTypes[adapter], itemsPath: "items", nextCursorPath: "nextCursor", cursorParam: "cursor", externalIdPath: "id", fields: mappingFields[adapter] ?? {} }, null, 2);
  return { sourceSystem: source.id, displayName: source.name, mode: source.mode, endpointUrl: connector?.endpointUrl ?? "", adapterProfile: adapter, authType: connector?.authType ?? "bearer", credentialRef: connector?.credentialRef ?? `${source.id}_API_TOKEN`, healthcheckPath: connector?.healthcheckPath ?? "/health", timeoutMs: connector?.timeoutMs ?? 10000, inboundAllowlist: allowlist, mapping };
}

export function EnterpriseIntegrationConsole({ notify, copySchema }: { notify: Notify; copySchema: () => void }) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const projectId = getCurrentProjectId();
  const load = useCallback(async () => {
    const [connectorResponse, eventResponse] = await Promise.all([
      fetch(`/api/integrations/connectors?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" }),
      fetch(`/api/integrations/events?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" }),
    ]);
    const connectorPayload = await connectorResponse.json(); const eventPayload = await eventResponse.json();
    if (!connectorResponse.ok) throw new Error(connectorPayload.error ?? "连接器读取失败");
    setConnectors(connectorPayload.connectors ?? []); setRuns(connectorPayload.runs ?? []); setEvents(eventPayload.events ?? []);
  }, [projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial API hydration is asynchronous and scoped to the routed project
  useEffect(() => { void load().catch((error) => notify(error instanceof Error ? error.message : "企业数据源读取失败")); }, [load, notify]);
  const bySource = useMemo(() => new Map(connectors.map((connector) => [connector.sourceSystem, connector])), [connectors]);

  const save = async () => {
    if (!draft) return;
    setWorking("save");
    try {
      let mapping: unknown;
      try { mapping = JSON.parse(draft.mapping); } catch { throw new Error("字段映射不是有效 JSON"); }
      const response = await fetch("/api/integrations/connectors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        projectId, sourceSystem: draft.sourceSystem, displayName: draft.displayName, mode: draft.mode,
        endpointUrl: draft.endpointUrl, adapterProfile: draft.adapterProfile, authType: draft.authType,
        credentialRef: draft.authType === "none" ? null : draft.credentialRef, healthcheckPath: draft.healthcheckPath,
        timeoutMs: draft.timeoutMs, inboundAllowlist: draft.inboundAllowlist.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean), fieldMapping: mapping,
      }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "连接器保存失败");
      notify(`${draft.sourceSystem} 配置已保存；请在部署环境绑定 ${draft.credentialRef || "对应凭据"} 后执行检查`); setDraft(null); await load();
    } catch (error) { notify(error instanceof Error ? error.message : "连接器保存失败"); }
    finally { setWorking(null); }
  };
  const action = async (connector: Connector, kind: "health" | "enable" | "disable" | "sync") => {
    setWorking(`${connector.id}:${kind}`);
    try {
      const target = kind === "health" ? "/api/integrations/health" : kind === "sync" ? "/api/integrations/sync" : "/api/integrations/connectors";
      const response = await fetch(target, { method: kind === "enable" || kind === "disable" ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(kind === "health" || kind === "sync" ? { connectorId: connector.id } : { id: connector.id, enabled: kind === "enable" }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "操作失败");
      notify(kind === "health" ? `真实连接检查通过（HTTP ${payload.responseCode}）` : kind === "sync" ? `同步完成：读取 ${payload.recordsRead}，写入 ${payload.recordsWritten}，失败 ${payload.recordsFailed}` : `连接器已${kind === "enable" ? "启用" : "停用"}`);
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : "连接器操作失败"); }
    finally { setWorking(null); }
  };
  const processed = events.filter((event) => event.status === "processed").length;
  const successRate = events.length ? Math.round(processed / events.length * 100) : 0;

  return <>
    <div className="dataGrid"><section className="card sourceBoard"><div className="dataHead"><div><span>SOURCE CONNECTORS</span><h3>企业数据源与生产同步</h3><p>凭据仅保存为部署绑定引用；连接通过实测后才能启用，拉取同步使用增量游标与幂等键。</p></div><button disabled={!events.some((event) => event.status === "dead_letter")} onClick={() => downloadCsv("fabflow-dead-letter.csv", ["来源", "事件类型", "状态", "重试次数"], events.filter((event) => event.status === "dead_letter").map((event) => [event.sourceSystem, event.eventType, event.status, event.retryCount]))}>导出失败队列</button></div><div className="sourceRows">{sources.map((source) => { const connector = bySource.get(source.id); const status = connector?.status === "healthy" ? "健康" : connector?.status === "error" ? "关注" : connector ? "已配置" : "待配置"; return <div className="sourceRow sourceRowExtended" key={source.id}><i className={`sourceIcon ${status === "健康" ? "good" : status === "关注" ? "warn" : "idle"}`}>{source.id.slice(0, 2)}</i><span><b>{source.name}</b><small>{source.owner} · {source.mode}</small></span><div><em className={`sourceStatus ${status === "健康" ? "good" : status === "关注" ? "warn" : "idle"}`}>{status}</em><small>{connector?.lastSuccessAt ?? "未同步"}{connector?.lastError ? ` · ${connector.lastError}` : ""}</small></div><div className="sourceActions"><button onClick={() => setDraft(draftFor(source, connector))}>配置</button>{connector && <><button disabled={Boolean(working)} onClick={() => void action(connector, "health")}>实测</button><button disabled={!connector.verifiedAt || Boolean(working)} onClick={() => void action(connector, connector.enabled ? "disable" : "enable")}>{connector.enabled ? "停用" : "启用"}</button><button className="syncButton" disabled={!connector.enabled || Boolean(working)} onClick={() => void action(connector, "sync")}>同步</button></>}</div></div>; })}</div></section><aside className="card eventQueue"><span>EVENT QUEUE</span><h3>同步运行与事件总线</h3><div className="queueRing"><b>{successRate}%</b><small>事件成功率</small></div><p><span>最近运行</span><b>{runs.length}</b></p><p><span>部分失败</span><b className="amberText">{runs.filter((run) => run.status === "partial").length}</b></p><p><span>死信事件</span><b className="redText">{events.filter((event) => event.status === "dead_letter").length}</b></p><button className="fullPrimary" disabled={!runs.length} onClick={() => downloadCsv("fabflow-sync-runs.csv", ["运行", "类型", "状态", "读取", "写入", "失败", "开始"], runs.map((run) => [run.id, run.runType, run.status, run.recordsRead, run.recordsWritten, run.recordsFailed, run.startedAt]))}>{runs.length ? "导出同步运行" : "暂无同步运行"}</button></aside><section className="card dataContract"><div className="dataHead"><div><span>CANONICAL MODEL</span><h3>统一对象与数据契约</h3></div><button onClick={copySchema}>复制 JSON Schema</button></div><div className="contractGrid">{[["Project", "项目主键、阶段、厂区"], ["System", "系统边界、负责人、状态"], ["Tag / Interface", "Tag、接口、Cause & Effect"], ["Material / PO", "物料、供应商、订单与收货"], ["Test Pack / Punch", "测试证据、NCR、Punch"], ["Attachment / Audit", "文件版本、签名、审计事件"]].map(([name, desc]) => <div key={name}><code>{name}</code><p>{desc}</p><i>→</i></div>)}</div></section></div>
    {draft && <div className="modalShade" role="dialog" aria-modal="true"><section className="card connectorDialog"><div className="dataHead"><div><span>PRODUCTION CONNECTOR</span><h3>{draft.displayName}</h3><p>这里保存地址、映射与密钥引用；密钥值请由部署管理员注入。</p></div><button onClick={() => setDraft(null)}>关闭</button></div><div className="connectorForm"><label><span>API 地址</span><input value={draft.endpointUrl} onChange={(event) => setDraft({ ...draft, endpointUrl: event.target.value })} placeholder="https://api.company.com/v1/orders" /></label><label><span>适配器模板</span><select value={draft.adapterProfile} onChange={(event) => { const adapterProfile = event.target.value; setDraft({ ...draft, adapterProfile, mapping: JSON.stringify({ eventType: eventTypes[adapterProfile], itemsPath: "items", nextCursorPath: "nextCursor", cursorParam: "cursor", externalIdPath: "id", fields: mappingFields[adapterProfile] ?? {} }, null, 2) }); }}>{adapterOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>认证方式</span><select value={draft.authType} onChange={(event) => setDraft({ ...draft, authType: event.target.value })}><option value="bearer">Bearer Token</option><option value="api_key">X-API-Key</option><option value="basic">Basic</option><option value="none">无认证</option></select></label><label><span>凭据绑定引用</span><input value={draft.credentialRef} disabled={draft.authType === "none"} onChange={(event) => setDraft({ ...draft, credentialRef: event.target.value.toUpperCase() })} placeholder="ERP_API_TOKEN" /></label><label><span>健康检查路径</span><input value={draft.healthcheckPath} onChange={(event) => setDraft({ ...draft, healthcheckPath: event.target.value })} placeholder="/health" /></label><label><span>超时（ms）</span><input type="number" min={1000} max={30000} value={draft.timeoutMs} onChange={(event) => setDraft({ ...draft, timeoutMs: Number(event.target.value) })} /></label><label className="wide"><span>Webhook 来源 IP / CIDR 白名单（每行一项，空白表示不限制）</span><textarea value={draft.inboundAllowlist} onChange={(event) => setDraft({ ...draft, inboundAllowlist: event.target.value })} placeholder={'203.0.113.20\n198.51.100.0/24'} /></label><label className="wide"><span>上游字段 → Facility Construction Management Software 权威字段映射 JSON</span><textarea className="mappingEditor" value={draft.mapping} onChange={(event) => setDraft({ ...draft, mapping: event.target.value })} /></label></div><div className="dialogActions"><button onClick={() => setDraft(null)}>取消</button><button className="primaryButton" disabled={working === "save"} onClick={() => void save()}>{working === "save" ? "保存中…" : "保存配置"}</button></div></section></div>}
  </>;
}
