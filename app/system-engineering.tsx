"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv, openMasterData } from "@/lib/client-actions";
import { facilityDomains, getFacilitySystem } from "@/lib/facility-systems";
import { getCurrentProjectId } from "@/lib/project-context";
import { useWorkflowStates } from "@/lib/workflow-state";

type Notify = (message: string) => void;
type SystemSummary = { id: string; code: string; name: string; ownerEmail?: string | null; designMaturity: number; status: string; tags: number; interfaces: number; openInterfaces: number; bomItems: number; testPacks: number; testCompletion: number; openPunches: number; criticalIssues: number; warningIssues: number; readiness: number };
type Issue = { id: string; severity: "critical" | "warning" | "info"; category: string; title: string; detail: string; entityType: string; entityId: string; systemId?: string };
type TagRecord = { id: string; systemId: string; tagNo: string };
type InterfaceRecord = { id: string; fromTagId?: string | null; toTagId?: string | null; interfaceCode: string; medium: string; connectionStandard: string; nominalSize: string; designPressureMpa: number; designTemperatureC: number; cleanlinessGrade: string; ownerDiscipline: string; status: string };
type TestPackRecord = { id: string; systemId?: string | null; packNumber: string; title: string; testType: string; status: string; witnessRequired: boolean; signedAt?: string | null };
type PunchRecord = { id: string; systemId?: string | null; punchNumber: string; category: string; description: string; status: string };
type EngineeringData = {
  summary: { systems: number; designMaturity: number; interfaces: number; openInterfaces: number; criticalInterfaces: number; testPacks: number; testCompletion: number; openPunches: number; classAPunches: number; readiness: number; criticalIssues: number; warningIssues: number };
  systems: SystemSummary[];
  issues: Issue[];
  records: { interfaces: InterfaceRecord[]; tags: TagRecord[]; testPacks: TestPackRecord[]; punchItems: PunchRecord[] };
 };
type DomainCard = (typeof facilityDomains)[number] & { design: number; tags: number; interfaces: number; bom: number; tests: number; readiness: number; critical: number; warning: number; owner: string; metric: string; risk: string };

const readinessTemplate = [
  ["边界与 Tag 清单冻结", "系统边界、设备 Tag、管线号和 I/O 点表具备受控版本", "待开始"],
  ["设计基准与计算书", "容量、峰值、冗余、压力、流量和能耗计算已批准", "进行中"],
  ["Vendor Data 与接口", "关键设备资料、接口、联锁和维护空间已锁定", "进行中"],
  ["施工图与工作包", "IFC 图、材料、施工方案和 ITP 已关联", "待开始"],
  ["试验与调试包", "压力、气密、冲洗、功能和联锁试验包已建立", "待开始"],
  ["移交与运营资料", "SOP、培训、备件、竣工图和 O&M 已纳入", "待开始"],
];

const closed = (status: string) => ["closed", "completed", "complete", "approved", "signed", "已关闭", "完成"].includes(status.toLowerCase()) || ["已关闭", "完成"].includes(status);
const statusLabel = (status: string) => closed(status) ? "已关闭" : ["working", "in_progress", "coordinating", "协调中", "进行中"].includes(status.toLowerCase()) ? "协调中" : status === "open" ? "待确认" : status;
const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

export function SystemEngineeringPage({ notify }: { notify: Notify }) {
  const [selected, setSelected] = useState(() => typeof window === "undefined" ? "UTL" : window.sessionStorage.getItem("fabflow:system-domain") || "UTL");
  const [tab, setTab] = useState("系统总览");
  const [data, setData] = useState<EngineeringData | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const { states: readinessStates, save: saveReadiness } = useWorkflowStates("system_readiness");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/engineering/validate?projectId=${encodeURIComponent(getCurrentProjectId())}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "系统工程数据加载失败"); return payload as EngineeringData; })
      .then((payload) => { setData(payload); setError(""); })
      .catch((cause) => { if (cause instanceof Error && cause.name !== "AbortError") setError(cause.message); });
    return () => controller.abort();
  }, [refresh]);

  const domainCards = useMemo<DomainCard[]>(() => facilityDomains.map((domain) => {
    const projectSystems = (data?.systems ?? []).filter((system) => getFacilitySystem(system.code)?.domainId === domain.id);
    const critical = projectSystems.reduce((sum, item) => sum + item.criticalIssues, 0);
    const warning = projectSystems.reduce((sum, item) => sum + item.warningIssues, 0);
    const owners = [...new Set(projectSystems.map((item) => item.ownerEmail).filter(Boolean))] as string[];
    return {
      ...domain,
      progress: average(projectSystems.map((item) => item.readiness)),
      design: average(projectSystems.map((item) => item.designMaturity)),
      tags: projectSystems.reduce((sum, item) => sum + item.tags, 0),
      interfaces: projectSystems.reduce((sum, item) => sum + item.interfaces, 0),
      bom: projectSystems.reduce((sum, item) => sum + item.bomItems, 0),
      tests: projectSystems.reduce((sum, item) => sum + item.testPacks, 0),
      readiness: average(projectSystems.map((item) => item.readiness)),
      critical,
      warning,
      owner: owners.join("、") || "待指定系统负责人",
      metric: `${projectSystems.length} 个项目系统`,
      risk: critical ? `${critical} 个关键阻断` : warning ? `${warning} 个待完善项` : projectSystems.length ? "无关键阻断" : "项目尚未建立此系统域",
    };
  }), [data]);
  const current = domainCards.find((item) => item.id === selected) ?? domainCards[0];
  const currentSystems = (data?.systems ?? []).filter((system) => getFacilitySystem(system.code)?.domainId === current.id);
  const checks = readinessTemplate.map((row, index) => [row[0], row[1], readinessStates[`${selected}:${index}`]?.status ?? row[2]]);

  const toggleCheck = async (index: number) => {
    const row = checks[index];
    const status = row[2] === "完成" ? "进行中" : "完成";
    try {
      await saveReadiness(`${selected}:${index}`, status, { domainId: selected, name: row[0], description: row[1] }, String(row[0]), "readiness_item");
      notify(`${current.name} · ${row[0]} 已更新为${status}`);
    } catch (cause) { notify(cause instanceof Error ? cause.message : "准入状态保存失败"); }
  };

  const closeInterface = async (id: string) => {
    try {
      const response = await fetch("/api/master-data", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: "interfaces", id, data: { status: "closed" } }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "接口关闭失败");
      setRefresh((value) => value + 1);
      notify("接口状态已写入 D1 并记录审计日志");
    } catch (cause) { notify(cause instanceof Error ? cause.message : "接口关闭失败"); }
  };

  const summary = data?.summary ?? { systems: 0, designMaturity: 0, interfaces: 0, openInterfaces: 0, criticalInterfaces: 0, testPacks: 0, testCompletion: 0, openPunches: 0, classAPunches: 0, readiness: 0, criticalIssues: 0, warningIssues: 0 };
  return <>
    <div className="moduleTop systemTop"><div><span>SYSTEM ENGINEERING DOMAINS</span><h2>厂务系统工程域总览</h2><p>所有数字来自当前项目 D1 的系统、Tag、接口、BOM、测试包和 Punch 联合校验</p></div><div className="moduleActions"><button className="softButton" onClick={() => downloadCsv("fabflow-system-validation.csv", ["系统编码","系统名称","设计成熟度","Tag","接口","BOM","测试包","准备度","关键问题"], (data?.systems ?? []).map((item) => [item.code,item.name,item.designMaturity,item.tags,item.interfaces,item.bomItems,item.testPacks,item.readiness,item.criticalIssues]))}>导出校验结果</button><button className="primaryButton" onClick={() => openMasterData("systems")}>＋ 新建系统边界</button></div></div>
    {error && <section className="card errorBanner"><b>系统工程数据加载失败</b><span>{error}</span><button onClick={() => setRefresh((value) => value + 1)}>重试</button></section>}
    <div className="systemDomainKpis"><section className="card"><span>项目系统</span><b>{summary.systems}<small>个</small></b><p>{domainCards.filter((item) => item.metric !== "0 个项目系统").length} 个工程域有数据</p></section><section className="card"><span>设计成熟度</span><b>{summary.designMaturity}<small>%</small></b><p>按项目系统台账实时平均</p></section><section className="card"><span>开放接口</span><b>{summary.openInterfaces}<small> / {summary.interfaces}</small></b><p className={summary.criticalInterfaces ? "redText" : ""}>{summary.criticalInterfaces} 项关键接口问题</p></section><section className="card"><span>测试包</span><b>{summary.testPacks}<small>包</small></b><p>完成率 {summary.testCompletion}%</p></section><section className="card"><span>系统准备度</span><b>{summary.readiness}<small>%</small></b><p className={summary.classAPunches ? "redText" : ""}>A 类未关闭 Punch {summary.classAPunches} 项</p></section></div>
    <div className="systemTabs">{["系统总览","接口与联锁","系统准入","测试与移交"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}><i>{item === "系统总览" ? "◎" : item === "接口与联锁" ? "◇" : item === "系统准入" ? "✓" : "⌁"}</i><span>{item}</span><small>{item === "系统总览" ? `${summary.systems} systems` : item === "接口与联锁" ? `${summary.openInterfaces} open` : item === "系统准入" ? `${summary.criticalIssues} blockers` : `${summary.testPacks} packs`}</small></button>)}</div>
    {tab === "系统总览" && <OverviewView systems={domainCards} selected={selected} setSelected={setSelected} current={current} projectSystems={currentSystems} notify={notify}/>}
    {tab === "接口与联锁" && <InterfaceView data={data} close={closeInterface} notify={notify}/>}
    {tab === "系统准入" && <ReadinessView checks={checks} toggle={toggleCheck} current={current} projectSystems={currentSystems} notify={notify}/>}
    {tab === "测试与移交" && <SystemTestingView current={current} systemIds={new Set(currentSystems.map((item) => item.id))} data={data} notify={notify}/>}
  </>;
}

function OverviewView({ systems, selected, setSelected, current, projectSystems, notify }: { systems: DomainCard[]; selected: string; setSelected: (value: string) => void; current: DomainCard; projectSystems: SystemSummary[]; notify: Notify }) {
  return <><div className="domainGrid">{systems.map((system) => <button className={`card domainCard ${selected === system.id ? "active" : ""}`} key={system.id} onClick={() => setSelected(system.id)}><div className={`domainIcon ${system.color}`}>{system.icon}</div><div className="domainHeader"><span>{system.id} · {system.tags} Tags</span><i className={system.color}>{system.critical ? "阻断" : system.warning ? "关注" : system.metric.startsWith("0") ? "未建立" : "正常"}</i></div><h3>{system.name}</h3><small className="domainEn">{system.en}</small><p>{system.scope}</p><div className="domainProgress"><span><b>系统准备度</b><em>{system.readiness}%</em></span><div><i style={{ width: `${system.readiness}%` }}/></div></div><div className="domainStats"><span>Tag <b>{system.tags}</b></span><span>接口 <b>{system.interfaces}</b></span><span>BOM <b>{system.bom}</b></span></div><footer><span><i className={`domainDot ${system.color}`}/>{system.risk}</span><em>{system.metric}</em></footer></button>)}</div><div className="domainDetailLayout"><section className="card domainDetail"><div className="systemHead"><div className={`domainIcon ${current.color}`}>{current.icon}</div><div><span>{current.id} · PROJECT SYSTEMS</span><h3>{current.name}</h3><p>{projectSystems.length ? `${projectSystems.length} 个系统已纳入当前项目联合校验` : "当前项目还没有建立此工程域的系统记录"}</p></div><button onClick={() => { openMasterData("systems", current.id); notify(`已打开 ${current.name} 系统台账`); }}>打开系统台账 →</button></div><div className="boundaryFlow"><div><i>01</i><span><b>设计输入</b><small>System / Tag / Basis</small></span></div><em>→</em><div><i>02</i><span><b>接口与选型</b><small>Interface / Material / Vendor</small></span></div><em>→</em><div><i>03</i><span><b>施工与试验</b><small>BOM / CWP / ITP / Test</small></span></div><em>→</em><div><i>04</i><span><b>关闭与移交</b><small>Punch / Evidence / Handover</small></span></div></div>{projectSystems.length ? <div className="domainInterfaceTable"><table><thead><tr><th>系统</th><th>设计成熟度</th><th>Tag / 接口</th><th>BOM / 测试包</th><th>准备度</th><th>问题</th></tr></thead><tbody>{projectSystems.map((item) => <tr key={item.id}><td><button onClick={() => openMasterData("systems", item.id)}><code>{item.code}</code> {item.name}</button></td><td>{item.designMaturity}%</td><td>{item.tags} / {item.interfaces}</td><td>{item.bomItems} / {item.testPacks}</td><td><b>{item.readiness}%</b></td><td><b className={item.criticalIssues ? "redText" : item.warningIssues ? "amberText" : ""}>{item.criticalIssues} / {item.warningIssues}</b></td></tr>)}</tbody></table></div> : <div className="emptyState"><b>尚无项目系统</b><p>点击“新建系统边界”录入，或从标准系统目录初始化。</p></div>}</section><aside className="card domainNotes"><span>SYSTEM OWNER & QUALITY</span><h3>{current.owner}</h3><p>此处只显示可追溯项目数据，不再使用演示进度或虚构测试数量。</p><div><b>当前联合校验</b><span>{current.risk}</span></div><button className="fullPrimary" onClick={() => { openMasterData("workflowActions", current.id); notify(`${current.name} 评审任务表单已打开`); }}>发起系统评审</button></aside></div></>;
}

function InterfaceView({ data, close, notify }: { data: EngineeringData | null; close: (id: string) => void; notify: Notify }) {
  const tags = new Map((data?.records.tags ?? []).map((tag) => [tag.id, tag]));
  const interfaceIssues = data?.issues.filter((issue) => issue.category === "interface") ?? [];
  const riskFor = (id: string) => interfaceIssues.some((issue) => issue.entityId === id && issue.severity === "critical") ? "高" : interfaceIssues.some((issue) => issue.entityId === id) ? "中" : "低";
  const rows = data?.records.interfaces ?? [];
  return <><section className="card interfaceHero"><div><span>INTERFACE REGISTER & VALIDATION</span><h2>系统接口联合校验</h2><p>接口状态、介质、压力温度和 Tag 关联均来自当前项目权威记录。</p></div><div className="interfaceCounts"><b>{data?.summary.openInterfaces ?? 0}<small>开放接口</small></b><b className="redText">{data?.summary.criticalInterfaces ?? 0}<small>关键问题</small></b><b>{rows.length}<small>接口总数</small></b></div></section><section className="card domainInterfaceBoard"><div className="systemHead"><div><span>INTERFACE REGISTER</span><h3>接口责任、设计条件与关闭状态</h3></div><div><button onClick={() => downloadCsv("fabflow-interface-register.csv", ["接口编号","起点 Tag","终点 Tag","介质","连接","尺寸","压力 MPa","温度 °C","责任专业","状态"], rows.map((item) => [item.interfaceCode,item.fromTagId ? tags.get(item.fromTagId)?.tagNo || "未知" : "外部",item.toTagId ? tags.get(item.toTagId)?.tagNo || "未知" : "外部",item.medium,item.connectionStandard,item.nominalSize,item.designPressureMpa,item.designTemperatureC,item.ownerDiscipline,item.status]))}>导出接口表</button><button onClick={() => { openMasterData("interfaces"); notify("已打开接口新增表单"); }}>＋ 新增接口</button></div></div><div className="domainInterfaceTable"><table><thead><tr><th>接口编号</th><th>Tag 边界 / 责任专业</th><th>工程条件</th><th>状态</th><th>风险</th><th></th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><code>{item.interfaceCode}</code></td><td><b>{item.fromTagId ? tags.get(item.fromTagId)?.tagNo || "未知 Tag" : "外部边界"} → {item.toTagId ? tags.get(item.toTagId)?.tagNo || "未知 Tag" : "外部边界"}</b><small>{item.ownerDiscipline}</small></td><td>{item.medium} · {item.connectionStandard} {item.nominalSize}<small>{item.designPressureMpa} MPa / {item.designTemperatureC}°C / {item.cleanlinessGrade}</small></td><td><i className={`interfaceState ${closed(item.status) ? "closed" : statusLabel(item.status) === "协调中" ? "working" : "pending"}`}>{statusLabel(item.status)}</i></td><td><b className={riskFor(item.id) === "高" ? "redText" : riskFor(item.id) === "中" ? "amberText" : ""}>{riskFor(item.id)}</b></td><td><button disabled={closed(item.status)} onClick={() => close(item.id)}>{closed(item.status) ? "已关闭" : "关闭接口"}</button></td></tr>)}{!rows.length && <tr><td colSpan={6}>当前项目尚无接口记录，请从介质参数录入或接口台账建立。</td></tr>}</tbody></table></div></section><section className="card gateEvidence"><div className="systemHead"><div><span>ENGINEERING VALIDATION ISSUES</span><h3>接口与设计输入问题</h3></div><b>{interfaceIssues.length} 项</b></div>{interfaceIssues.map((issue) => <button className="evidenceRow" key={issue.id} onClick={() => openMasterData(issue.entityType, issue.entityId)}><i className={issue.severity === "critical" ? "" : "working"}>{issue.severity === "critical" ? "!" : "•"}</i><span><b>{issue.title}</b><small>{issue.detail}</small></span><em className={issue.severity === "critical" ? "" : "working"}>{issue.severity === "critical" ? "阻断" : "待完善"}</em><strong>定位记录 →</strong></button>)}{!interfaceIssues.length && <div className="emptyState"><b>未发现接口级问题</b><p>联合校验未发现 Tag、介质、压力或温度冲突。</p></div>}</section></>;
}

function ReadinessView({ checks, toggle, current, projectSystems, notify }: { checks: string[][]; toggle: (index: number) => void; current: DomainCard; projectSystems: SystemSummary[]; notify: Notify }) {
  const done = checks.filter((item) => item[2] === "完成").length;
  const totals = { tags: projectSystems.reduce((sum, item) => sum + item.tags, 0), interfaces: projectSystems.reduce((sum, item) => sum + item.interfaces, 0), bom: projectSystems.reduce((sum, item) => sum + item.bomItems, 0), tests: projectSystems.reduce((sum, item) => sum + item.testPacks, 0), blockers: projectSystems.reduce((sum, item) => sum + item.criticalIssues, 0) };
  return <><section className="card readinessHero"><div><span>SYSTEM READINESS GATE</span><h2>{current.name} · 准入证据</h2><p>左侧为可操作的准入清单，右侧为当前项目实际数据覆盖度。</p></div><div className="readinessScore"><b>{Math.round(done / checks.length * 100)}%</b><span>{done} / {checks.length} 项人工确认</span></div></section><div className="readinessLayout"><section className="card gateEvidence"><div className="systemHead"><div><span>GATE EVIDENCE CHECKLIST</span><h3>系统准入证据清单</h3></div><button onClick={() => { downloadCsv(`fabflow-${current.id}-readiness-evidence.csv`, ["证据项","验收内容","状态"], checks); notify("准入证据清单已导出"); }}>导出清单</button></div>{checks.map((item, index) => <button className="evidenceRow" key={item[0]} onClick={() => toggle(index)}><i className={item[2] === "完成" ? "done" : item[2] === "进行中" ? "working" : ""}>{item[2] === "完成" ? "✓" : item[2] === "进行中" ? "•" : ""}</i><span><b>{item[0]}</b><small>{item[1]}</small></span><em className={item[2] === "完成" ? "done" : item[2] === "进行中" ? "working" : ""}>{item[2]}</em><strong>切换状态</strong></button>)}</section><aside className="card permitCard"><span>PROJECT DATA COVERAGE</span><h3>实际工程数据覆盖</h3><p><span><b>系统 / Tag</b><small>{projectSystems.length} 个系统 · {totals.tags} 个 Tag</small></span></p><p><span><b>接口 / BOM</b><small>{totals.interfaces} 个接口 · {totals.bom} 行 BOM</small></span></p><p><span><b>测试包</b><small>{totals.tests} 个受控测试包</small></span></p><p><span><b>联合校验阻断</b><small className={totals.blockers ? "redText" : ""}>{totals.blockers} 项</small></span></p><button className="fullPrimary" onClick={() => { openMasterData("workflowActions", current.id); notify("已打开准入审批动作"); }}>打开准入审批</button></aside></div></>;
}

function SystemTestingView({ current, systemIds, data, notify }: { current: DomainCard; systemIds: Set<string>; data: EngineeringData | null; notify: Notify }) {
  const tests = (data?.records.testPacks ?? []).filter((item) => item.systemId && systemIds.has(item.systemId));
  const punches = (data?.records.punchItems ?? []).filter((item) => item.systemId && systemIds.has(item.systemId) && !closed(item.status));
  const completed = tests.filter((item) => closed(item.status)).length;
  const signed = tests.filter((item) => Boolean(item.signedAt)).length;
  const progress = (status: string) => closed(status) ? 100 : ["executing", "in_progress", "进行中"].includes(status.toLowerCase()) ? 60 : 10;
  return <><div className="testKpis"><section className="card"><span>本域试验包</span><b>{tests.length}</b><small>已完成 {completed} · 未完成 {tests.length - completed}</small></section><section className="card"><span>完成率</span><b>{tests.length ? Math.round(completed / tests.length * 100) : 0}%</b><small>来自测试包状态</small></section><section className="card"><span>签字证据</span><b>{signed}</b><small>见证与签字记录</small></section><section className="card"><span>移交阻断</span><b>{punches.filter((item) => item.category.toUpperCase() === "A").length}</b><small className={punches.some((item) => item.category.toUpperCase() === "A") ? "redText" : ""}>A 类未关闭 Punch</small></section></div><section className="card systemTestBoard"><div className="systemHead"><div><span>TEST & HANDOVER PACK</span><h3>{current.name} · 测试包</h3></div><button onClick={() => { openMasterData("testPacks"); notify("已打开测试包新增表单"); }}>＋ 新建测试包</button></div>{tests.map((item) => <div className="systemTestRow" key={item.id}><i className={closed(item.status) ? "done" : statusLabel(item.status) === "协调中" ? "working" : ""}>{closed(item.status) ? "✓" : statusLabel(item.status) === "协调中" ? "•" : ""}</i><span><code>{item.packNumber}</code><b>{item.title}</b><small>{item.testType}{item.witnessRequired ? " · 需见证" : ""}{item.signedAt ? ` · 已签 ${item.signedAt}` : ""}</small></span><div><span><b>{progress(item.status)}%</b>{statusLabel(item.status)}</span><p><i style={{ width: `${progress(item.status)}%` }}/></p></div><button onClick={() => openMasterData("testPacks", item.id)}>查看包 →</button></div>)}{!tests.length && <div className="emptyState"><b>本工程域尚无测试包</b><p>请按系统建立压力、气密、冲洗、功能或联锁测试包。</p></div>}</section><section className="card domainInterfaceBoard"><div className="systemHead"><div><span>TURNOVER BLOCKERS</span><h3>未关闭 Punch</h3></div><button onClick={() => openMasterData("punchItems")}>打开 Punch 台账</button></div><div className="domainInterfaceTable"><table><thead><tr><th>编号</th><th>分类</th><th>问题</th><th>状态</th><th></th></tr></thead><tbody>{punches.map((item) => <tr key={item.id}><td><code>{item.punchNumber}</code></td><td><b className={item.category.toUpperCase() === "A" ? "redText" : "amberText"}>{item.category}</b></td><td>{item.description}</td><td>{statusLabel(item.status)}</td><td><button onClick={() => openMasterData("punchItems", item.id)}>定位 →</button></td></tr>)}{!punches.length && <tr><td colSpan={5}>本工程域当前无未关闭 Punch。</td></tr>}</tbody></table></div></section></>;
}
