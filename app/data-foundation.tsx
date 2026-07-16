"use client";

import { useMemo, useState } from "react";

type Notify = (message: string) => void;

type Source = {
  id: string;
  name: string;
  owner: string;
  mode: string;
  status: "健康" | "关注" | "待配置";
  records: string;
  lastSync: string;
  cadence: string;
};

const initialSources: Source[] = [
  { id: "ERP", name: "ERP / 采购订单", owner: "采购与供应链", mode: "REST + 增量游标", status: "健康", records: "1,286", lastSync: "8 分钟前", cadence: "每 15 分钟" },
  { id: "SCHED", name: "Primavera / MS Project", owner: "项目控制", mode: "XER / CSV 导入", status: "关注", records: "428", lastSync: "2 小时前", cadence: "每日 06:00" },
  { id: "QMS", name: "QMS / NCR 与 ITP", owner: "QA/QC", mode: "Webhook + 附件", status: "健康", records: "3,942", lastSync: "21 分钟前", cadence: "实时事件" },
  { id: "BMS", name: "BMS / EPMS / I/O", owner: "机电自控", mode: "OPC UA / API", status: "待配置", records: "—", lastSync: "未连接", cadence: "待定" },
];

const roleRows = [
  ["设计工程师", "编辑设计输入、计算书、物料选型", "提交审批", "全项目"],
  ["系统负责人", "冻结系统边界、接口、Cause & Effect", "批准 G3 / RFC", "所属系统"],
  ["采购与供应链", "订单、供应商、收货与 IQC", "批准替代料", "采购包"],
  ["QA/QC 与调试", "ITP、测试包、NCR、Punch", "签署测试记录", "施工区域"],
  ["业主 / 运营", "只读查看、见证点、移交签收", "批准 RFC / RFSU", "项目全局"],
];

const workflowRows = [
  ["设计输入冻结", "工程师 → 系统负责人 → 项目经理", "3 / 4", "1 个待签"],
  ["材料替代审批", "供应商 → 采购 → 设计 → QA/QC", "2 / 4", "风险评估"],
  ["系统 RFC", "调试 → 系统负责人 → 业主运营", "1 / 3", "等待见证"],
  ["Punch A 关闭", "施工 → QA/QC → 业主", "2 / 3", "照片证据"],
];

const auditRows = [
  ["AUD-2026-0814", "林工", "修改 UTL-IF-014 压力设定", "设计输入", "8 分钟前", "已记录"],
  ["AUD-2026-0813", "赵工", "上传 TP-WTR-022 测试记录", "测试包", "21 分钟前", "已记录"],
  ["AUD-2026-0812", "供应商账号", "提交 CDA 球阀替代料", "采购审批", "42 分钟前", "待审"],
  ["AUD-2026-0811", "QA/QC", "关闭 NCR-034，关联照片 6 张", "质量", "1 小时前", "已记录"],
  ["AUD-2026-0810", "系统", "同步 ERP PO-240731", "数据同步", "1 小时前", "自动"],
];

const roadmap = [
  ["Phase 1", "权威数据模型", "项目、系统、Tag、接口、物料、订单、测试包、Punch、附件", "D1", "本周"],
  ["Phase 2", "文件与证据", "图纸、计算书、ITP、签字记录和照片按对象关联", "R2", "下周"],
  ["Phase 3", "身份与审批", "工作区身份、RBAC、审批链、电子签和审计日志", "Workspace Auth", "2 周"],
  ["Phase 4", "企业集成", "ERP / QMS / 计划 / BMS 事件同步，失败重试与对账", "API + Queue", "3–4 周"],
];

export function DataFoundationPage({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState("数据接入");
  const [sources, setSources] = useState(initialSources);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showBlueprint, setShowBlueprint] = useState(false);

  const healthy = useMemo(() => sources.filter((s) => s.status === "健康").length, [sources]);
  const syncSource = (id: string) => {
    setSyncing(id);
    window.setTimeout(() => {
      setSources((items) => items.map((s) => s.id === id ? { ...s, status: "健康", lastSync: "刚刚" } : s));
      setSyncing(null);
      notify(`${id} 数据同步完成，已写入待处理队列`);
    }, 650);
  };

  return <>
    <div className="moduleTop dataTop"><div><span>DATA FOUNDATION & GOVERNANCE</span><h2>数据底座与协同控制台</h2><p>把计划、采购、质量、测试、移交和附件统一挂到同一个项目对象，所有变化可追溯、可审批、可对账。</p></div><div className="moduleActions"><button className="softButton" onClick={() => setShowBlueprint(!showBlueprint)}>查看落地蓝图</button><button className="primaryButton" onClick={() => notify("数据接入申请已创建")}>＋ 新增数据源</button></div></div>
    <div className="dataKpis"><section className="card"><span>已接入数据源</span><b>{healthy}<small> / {sources.length}</small></b><p>ERP、QMS 已保持健康同步</p></section><section className="card"><span>待处理事件</span><b>42<small> 条</small></b><p className="amberText">7 条超过 SLA 4 小时</p></section><section className="card"><span>审批中对象</span><b>18<small> 个</small></b><p>设计输入、替代料、RFC、Punch</p></section><section className="card"><span>审计覆盖率</span><b>98<small>%</small></b><p>所有写操作保留操作者与版本</p></section></div>
    <div className="dataTabs">{[["数据接入","Sources"],["权限与审批","RBAC / Workflow"],["附件与审计","R2 / Audit"],["落地蓝图","Roadmap"]].map(([label,sub]) => <button key={label} className={tab === label ? "active" : ""} onClick={() => setTab(label)}><i>{label === "数据接入" ? "⇄" : label === "权限与审批" ? "♙" : label === "附件与审计" ? "▧" : "⌁"}</i><span>{label}</span><small>{sub}</small></button>)}</div>
    {tab === "数据接入" && <SourceView sources={sources} syncing={syncing} syncSource={syncSource} notify={notify} />}
    {tab === "权限与审批" && <GovernanceView notify={notify} />}
    {tab === "附件与审计" && <EvidenceView notify={notify} />}
    {tab === "落地蓝图" && <RoadmapView notify={notify} />}
    {showBlueprint && <div className="dataBlueprint card"><div><span>IMPLEMENTATION NOTE</span><h3>建议的最小可行数据底座</h3><p>先落项目、系统、Tag、接口、物料、订单、测试包、Punch 八类权威对象；前端演示状态迁移到 D1，图纸和签字证据放 R2，身份沿用工作区登录。</p></div><button className="fullPrimary" onClick={() => { setShowBlueprint(false); setTab("落地蓝图"); }}>打开实施清单 →</button></div>}
  </>;
}

function SourceView({ sources, syncing, syncSource, notify }: { sources: Source[]; syncing: string | null; syncSource: (id: string) => void; notify: Notify }) {
  return <div className="dataGrid"><section className="card sourceBoard"><div className="dataHead"><div><span>SOURCE CONNECTORS</span><h3>企业数据源与同步健康度</h3><p>每个连接器都有负责人、同步频率、游标和失败重试记录。</p></div><button onClick={() => notify("同步失败队列已打开")}>查看失败队列</button></div><div className="sourceRows">{sources.map((s) => <div className="sourceRow" key={s.id}><i className={`sourceIcon ${s.status === "健康" ? "good" : s.status === "关注" ? "warn" : "idle"}`}>{s.id.slice(0, 2)}</i><span><b>{s.name}</b><small>{s.owner} · {s.mode}</small></span><div className="sourceCount"><b>{s.records}</b><small>记录</small></div><div><em className={`sourceStatus ${s.status === "健康" ? "good" : s.status === "关注" ? "warn" : "idle"}`}>{s.status}</em><small>{s.lastSync} · {s.cadence}</small></div><button className="syncButton" disabled={syncing === s.id} onClick={() => syncSource(s.id)}>{syncing === s.id ? "同步中…" : s.status === "待配置" ? "配置" : "立即同步"}</button></div>)}</div></section><aside className="card eventQueue"><span>EVENT QUEUE</span><h3>事件总线</h3><div className="queueRing"><b>87%</b><small>处理成功率</small></div><p><span>待处理</span><b>42</b></p><p><span>重试中</span><b className="amberText">7</b></p><p><span>死信队列</span><b className="redText">2</b></p><button className="fullPrimary" onClick={() => notify("事件队列详情已打开")}>查看事件详情</button></aside><section className="card dataContract"><div className="dataHead"><div><span>CANONICAL MODEL</span><h3>统一对象与数据契约</h3></div><button onClick={() => notify("数据契约模板已复制")}>复制 JSON Schema</button></div><div className="contractGrid">{[["Project","项目主键、阶段、厂区"],["System","系统边界、负责人、状态"],["Tag / Interface","Tag、接口、Cause & Effect"],["Material / PO","物料、供应商、订单与收货"],["Test Pack / Punch","测试证据、NCR、Punch"],["Attachment / Audit","文件版本、签名、审计事件"]].map(([name,desc]) => <div key={name}><code>{name}</code><p>{desc}</p><i>→</i></div>)}</div></section></div>;
}

function GovernanceView({ notify }: { notify: Notify }) {
  return <div className="dataGrid"><section className="card roleBoard"><div className="dataHead"><div><span>RBAC MATRIX</span><h3>按项目、系统、采购包分层授权</h3><p>权限不能只靠前端按钮隐藏，最终必须在服务端按对象和动作校验。</p></div><button onClick={() => notify("角色模板已复制")}>复制角色模板</button></div><div className="roleTable"><table><thead><tr><th>角色</th><th>可操作范围</th><th>审批动作</th><th>数据范围</th></tr></thead><tbody>{roleRows.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td><i className="permissionTag">{r[2]}</i></td><td>{r[3]}</td></tr>)}</tbody></table></div></section><aside className="card approvalBoard"><span>WORKFLOW QUEUE</span><h3>审批链与 SLA</h3>{workflowRows.map((r) => <button className="approvalRow" key={r[0]} onClick={() => notify(`${r[0]} 审批详情已打开`)}><span><b>{r[0]}</b><small>{r[1]}</small></span><em>{r[2]}</em><i>{r[3]}</i></button>)}<button className="fullPrimary" onClick={() => notify("审批流设计器已打开")}>配置审批流</button></aside></div>;
}

function EvidenceView({ notify }: { notify: Notify }) {
  return <div className="dataGrid"><section className="card auditBoard"><div className="dataHead"><div><span>R2 EVIDENCE & AUDIT</span><h3>附件证据链与不可抵赖审计</h3><p>文件以对象为中心挂接，版本、签署人、来源、哈希和审批事件形成完整证据链。</p></div><div><button onClick={() => notify("审计日志已导出")}>导出审计</button><button onClick={() => notify("附件上传入口已打开")}>＋ 上传附件</button></div></div><div className="auditRows">{auditRows.map((r) => <div className="auditRow" key={r[0]}><code>{r[0]}</code><span><b>{r[2]}</b><small>{r[1]} · {r[3]}</small></span><time>{r[4]}</time><em className={r[5] === "待审" ? "warn" : "good"}>{r[5]}</em></div>)}</div></section><aside className="card retentionBoard"><span>RETENTION POLICY</span><h3>保留与归档策略</h3><div className="retentionRing"><b>7 年</b><small>关键工程记录</small></div><p><span>设计输入 / 计算书</span><b>永久 + 版本</b></p><p><span>测试 / 签字记录</span><b>7 年</b></p><p><span>采购 / 收货记录</span><b>10 年</b></p><p><span>运行趋势数据</span><b>2 年热存</b></p><button className="fullPrimary" onClick={() => notify("归档策略已打开")}>管理归档策略</button></aside></div>;
}

function RoadmapView({ notify }: { notify: Notify }) {
  return <div className="roadmapLayout"><section className="card roadmapBoard"><div className="dataHead"><div><span>DELIVERY ROADMAP</span><h3>从演示状态迁移到真实数据的四个阶段</h3><p>建议先建立权威对象和写入边界，再做系统集成；不要一开始就把所有 ERP / BMS 接口同时接入。</p></div><button onClick={() => notify("实施任务已导出")}>导出任务清单</button></div>{roadmap.map((r, i) => <div className="roadmapRow" key={r[0]}><i>{String(i + 1).padStart(2, "0")}</i><span><b>{r[0]} · {r[1]}</b><small>{r[2]}</small></span><em>{r[3]}</em><time>{r[4]}</time></div>)}</section><aside className="card architectureBoard"><span>REFERENCE ARCHITECTURE</span><h3>推荐技术边界</h3><div className="architectureFlow"><div><b>Workspace Auth</b><small>身份与访问控制</small></div><i>↓</i><div><b>API / Queue</b><small>幂等、游标、重试、死信</small></div><i>↓</i><div><b>D1 + R2</b><small>对象、状态、文件与版本</small></div><i>↓</i><div><b>FabFlow UI</b><small>工程工作台与审计视图</small></div></div><button className="fullPrimary" onClick={() => notify("数据底座技术方案已复制")}>复制技术方案摘要</button></aside></div>;
}
