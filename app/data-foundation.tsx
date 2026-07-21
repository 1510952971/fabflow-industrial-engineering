"use client";

import "./integration-console.css";

import { useEffect, useState } from "react";
import { copyText, downloadCsv, openMasterData } from "@/lib/client-actions";
import { getCurrentProjectId } from "@/lib/project-context";
import { EnterpriseIntegrationConsole } from "./integration-console";
import { SignatureConsole } from "./signature-console";
import { AccountAdminPanel } from "./account-admin";

type Notify = (message: string) => void;

const roleRows = [
  ["设计工程师", "编辑设计输入、计算书、物料选型", "提交审批", "全项目"],
  ["系统负责人", "冻结系统边界、接口、Cause & Effect", "批准 G3 / RFC", "所属系统"],
  ["采购与供应链", "订单、供应商、收货与 IQC", "批准替代料", "采购包"],
  ["QA/QC 与调试", "ITP、测试包、NCR、Punch", "签署测试记录", "施工区域"],
  ["业主 / 运营", "只读查看、见证点、移交签收", "批准 RFC / RFSU", "项目全局"],
];



const roadmap = [
  ["Phase 1", "权威数据模型", "项目、系统、Tag、接口、物料、订单、测试包、Punch、附件", "D1", "本周"],
  ["Phase 2", "文件与证据", "图纸、计算书、ITP、签字记录和照片按对象关联", "R2", "下周"],
  ["Phase 3", "身份与审批", "工作区身份、RBAC、审批链、电子签和审计日志", "Workspace Auth", "2 周"],
  ["Phase 4", "设计选型与系统校验", "设计输入、设备材料选型、接口匹配、系统规则校验和偏差闭环", "Rule Engine + D1", "持续迭代"],
];

export function DataFoundationPage({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState("数据接入");
  const [showBlueprint, setShowBlueprint] = useState(false);
  const [foundation, setFoundation] = useState<{storage?:{d1:string;r2:string};principal?:{displayName:string;roles:string[]};counts?:Record<string,number>} | null>(null);
  const [foundationError, setFoundationError] = useState("");

  useEffect(() => {
    const selectTab = (value: string | null) => { if (["\u6570\u636e\u63a5\u5165", "\u6743\u9650\u4e0e\u5ba1\u6279", "\u9644\u4ef6\u4e0e\u5ba1\u8ba1", "\u7535\u5b50\u7b7e\u7ae0", "\u843d\u5730\u84dd\u56fe"].includes(value ?? "")) setTab(value as string); };
    selectTab(window.sessionStorage.getItem("fabflow:data-foundation-tab")); window.sessionStorage.removeItem("fabflow:data-foundation-tab");
    const listener = (event: Event) => selectTab((event as CustomEvent<string>).detail);
    window.addEventListener("fabflow:data-foundation-tab", listener);
    return () => window.removeEventListener("fabflow:data-foundation-tab", listener);
  }, []);

  const copySchema = () => {
    const schema = {
      Project: ["id", "code", "phase", "site", "status"],
      System: ["id", "projectId", "code", "owner", "status"],
      Tag: ["id", "systemId", "tagNo", "service", "status"],
      Interface: ["id", "systemId", "fromTag", "toTag", "status"],
      Material: ["id", "code", "name", "material", "brand", "status"],
      PurchaseOrder: ["id", "projectId", "poNo", "vendor", "status"],
      TestPack: ["id", "systemId", "code", "status", "evidence"],
      Punch: ["id", "systemId", "severity", "status", "dueDate"],
      Attachment: ["id", "objectType", "objectId", "version", "r2Key"],
      AuditLog: ["id", "actor", "action", "objectType", "objectId", "createdAt"],
    };
    void copyText(JSON.stringify(schema, null, 2))
      .then(() => notify("JSON Schema 已复制到剪贴板"))
      .catch((error) => notify(error instanceof Error ? error.message : "复制失败"));
  };

  useEffect(() => {
    const projectId=getCurrentProjectId();
    fetch("/api/foundation/summary?projectId="+encodeURIComponent(projectId)).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; }).then(setFoundation).catch((error) => setFoundationError(error instanceof Error ? error.message : "数据底座连接失败"));
  }, []);

  return <>
    <div className="moduleTop dataTop"><div><span>DATA FOUNDATION & GOVERNANCE</span><h2>数据底座与协同控制台</h2><p>把计划、采购、质量、测试、移交和附件统一挂到同一个项目对象，所有变化可追溯、可审批、可对账。</p></div><div className="moduleActions"><button className="softButton" onClick={() => setShowBlueprint(!showBlueprint)}>查看落地蓝图</button><button className="primaryButton" onClick={() => openMasterData("purchaseOrders")}>录入采购 / 数据对象</button></div></div>
    <div className={`dataBackendState card ${foundation?"connected":""}`}><i>{foundation?"✓":"…"}</i><span><b>{foundation?"D1 + R2 权威数据底座已连接":foundationError||"正在验证服务端数据底座"}</b><small>{foundation?`${foundation.principal?.displayName} · ${foundation.principal?.roles.join(" / ")} · 所有写入执行服务端 RBAC 与审计`:"发布环境会使用工作区身份，不以浏览器状态作为权限依据"}</small></span><em>{foundation?"ONLINE":"CHECKING"}</em></div>
    <div className="dataKpis"><section className="card"><span>D1 权威对象</span><b>{foundation?.counts?Object.entries(foundation.counts).filter(([key])=>["projects","systems","tags","interfaces","materials","testPacks","punchItems","equipmentModels"].includes(key)).reduce((sum,[,value])=>sum+value,0):"—"}<small> 条</small></b><p>项目、系统、Tag、接口、物料与工程记录</p></section><section className="card"><span>R2 文件证据</span><b>{foundation?.counts?.attachments??"—"}<small> 份</small></b><p>图纸、计算书、ITP、照片与签字记录</p></section><section className="card"><span>审批中对象</span><b>{foundation?.counts?.pendingApprovals??"—"}<small> 个</small></b><p>设计冻结、材料替代、RFC、Punch</p></section><section className="card"><span>审计事件</span><b>{foundation?.counts?.auditLogs??"—"}<small> 条</small></b><p>操作者、版本、来源和变更前后值</p></section></div>
    <div className="dataTabs">{[["数据接入","Sources"],["权限与审批","RBAC / Workflow"],["附件与审计","R2 / Audit"],["电子签章","E-Sign"],["落地蓝图","Roadmap"]].map(([label,sub]) => <button key={label} className={tab === label ? "active" : ""} onClick={() => setTab(label)}><i>{label === "数据接入" ? "⇄" : label === "权限与审批" ? "♙" : label === "附件与审计" ? "▧" : label === "电子签章" ? "✎" : "⌁"}</i><span>{label}</span><small>{sub}</small></button>)}</div>
    {tab === "数据接入" && <EnterpriseIntegrationConsole notify={notify} copySchema={copySchema} />}
    {tab === "权限与审批" && <GovernanceView notify={notify} />}
    {tab === "附件与审计" && <EvidenceView notify={notify} />}
    {tab === "电子签章" && <SignatureConsole notify={notify} />}
    {tab === "落地蓝图" && <RoadmapView notify={notify} />}
    {showBlueprint && <div className="dataBlueprint card"><div><span>IMPLEMENTATION NOTE</span><h3>建议的最小可行数据底座</h3><p>先落项目、系统、Tag、接口、物料、订单、测试包、Punch 八类权威对象；前端演示状态迁移到 D1，图纸和签字证据放 R2，身份沿用工作区登录。</p></div><button className="fullPrimary" onClick={() => { setShowBlueprint(false); setTab("落地蓝图"); }}>打开实施清单 →</button></div>}
  </>;
}


function GovernanceView({ notify }: { notify: Notify }) {
  const [approvals,setApprovals]=useState<Array<{id:string;title:string;workflowType:string;status:string;currentStep:number;stepsJson:string;requestedBy:string}>>([]);
  const [assignments,setAssignments]=useState<Array<{userId:string;email:string;displayName:string;role:string|null;scopeType:string|null;scopeId:string|null}>>([]);
  const projectId=getCurrentProjectId();
  const load=()=>{void fetch("/api/approvals?projectId="+encodeURIComponent(projectId),{cache:"no-store"}).then((response)=>response.json()).then((payload)=>setApprovals(payload.approvals??[])).catch(()=>setApprovals([]));void fetch("/api/access?projectId="+encodeURIComponent(projectId),{cache:"no-store"}).then((response)=>response.json()).then((payload)=>setAssignments(payload.users??[])).catch(()=>setAssignments([]));};
  // eslint-disable-next-line react-hooks/exhaustive-deps -- project changes remount this module through URL routing
  useEffect(load,[]);
  const decide=async(id:string,action:"approve"|"reject")=>{const note=window.prompt(action==="approve"?"请输入审批意见（可留空）":"请输入驳回原因")??"";const response=await fetch("/api/approvals",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,action,note})});const payload=await response.json();if(!response.ok){notify(payload.error||"审批处理失败");return}notify(payload.status==="pending"?"当前步骤已批准，已流转到下一审批人":"审批已"+(payload.status==="approved"?"通过":"驳回"));load();};
  return <><AccountAdminPanel projectId={projectId} notify={notify}/><div className="dataGrid"><section className="card roleBoard"><div className="dataHead"><div><span>RBAC MATRIX</span><h3>按项目与对象范围授权</h3><p>页面按钮与服务端权限使用同一身份、角色和项目范围；公开访客仅可查看演示项目。</p></div><button onClick={() => void copyText(roleRows.map(row=>row.join("\t")).join("\n")).then(()=>notify("角色模板已复制")).catch(error=>notify(error instanceof Error?error.message:"复制失败"))}>复制角色模板</button></div><div className="roleTable"><table><thead><tr><th>用户 / 角色</th><th>权限说明</th><th>范围类型</th><th>范围 ID</th></tr></thead><tbody>{assignments.length?assignments.map((row)=><tr key={(row.userId||row.email)+String(row.role)+String(row.scopeId)}><td><b>{row.displayName||row.email}</b><small>{row.role||"未授权"}</small></td><td>{row.email}</td><td><i className="permissionTag">{row.scopeType||"—"}</i></td><td>{row.scopeId||"—"}</td></tr>):roleRows.map((row)=><tr key={row[0]}><td><b>{row[0]}</b></td><td>{row[1]}</td><td><i className="permissionTag">{row[2]}</i></td><td>{row[3]}</td></tr>)}</tbody></table></div></section><aside className="card approvalBoard"><span>WORKFLOW QUEUE</span><h3>审批链与 SLA</h3>{approvals.map((approval)=>{let steps:string[]=[];try{steps=JSON.parse(approval.stepsJson)}catch{}const current=steps[approval.currentStep-1]||"已结束";return <div className="approvalRow" key={approval.id}><span><b>{approval.title}</b><small>{approval.workflowType} · 当前：{current}</small></span><em>{approval.currentStep} / {steps.length}</em><i>{approval.status}</i>{approval.status==="pending"&&<div><button onClick={()=>void decide(approval.id,"approve")}>批准</button><button onClick={()=>void decide(approval.id,"reject")}>驳回</button></div>}</div>})}{!approvals.length&&<div className="masterEmpty"><b>暂无可见审批</b><small>公开访客不可读取审批队列；登录后按项目权限显示。</small></div>}<button className="fullPrimary" onClick={() => {openMasterData("workflowActions","approval_workflow");notify("审批流配置数据已打开")}}>打开工作流台账</button></aside></div></>;
}

function EvidenceView({ notify }: { notify: Notify }) {
  const [logs,setLogs]=useState<Array<{id:string;actorEmail:string;action:string;entityType:string;entityId:string;createdAt:string}>>([]);
  const [query,setQuery]=useState("");
  useEffect(()=>{const projectId=getCurrentProjectId();void fetch("/api/audit-logs?projectId="+encodeURIComponent(projectId)+"&limit=300",{cache:"no-store"}).then((response)=>response.json()).then((payload)=>setLogs(payload.logs??[])).catch(()=>setLogs([]));},[]);
  const shown=logs.filter((log)=>!query||JSON.stringify(log).toLowerCase().includes(query.toLowerCase()));
  const exportAudit=()=>{downloadCsv("fabflow-audit-"+Date.now()+".csv",["时间","操作者","动作","对象类型","对象 ID"],shown.map((log)=>[log.createdAt,log.actorEmail,log.action,log.entityType,log.entityId]));notify("审计清单已下载")};
  return <div className="dataGrid"><section className="card auditBoard"><div className="dataHead"><div><span>R2 EVIDENCE & AUDIT</span><h3>附件证据链与不可抵赖审计</h3><p>文件以对象为中心挂接，版本、签署人、来源、哈希和审批事件形成完整证据链。</p></div><div><button onClick={exportAudit} disabled={!shown.length}>导出审计</button><button onClick={() => openMasterData("projects")}>选择对象并上传附件</button></div></div><label className="masterSearch">⌕<input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜索操作者、动作或对象…"/><kbd>{shown.length}</kbd></label><div className="auditRows">{shown.map((log) => <div className="auditRow" key={log.id}><code>{log.id.slice(0,8)}</code><span><b>{log.action}</b><small>{log.actorEmail} · {log.entityType} / {log.entityId}</small></span><time>{log.createdAt}</time><em className="good">已记录</em></div>)}{!shown.length&&<div className="masterEmpty"><b>暂无可见审计记录</b><small>公开访客不会读取敏感审计数据；登录并获得项目权限后显示。</small></div>}</div></section><aside className="card retentionBoard"><span>RETENTION POLICY</span><h3>保留与归档策略</h3><div className="retentionRing"><b>7 年</b><small>关键工程记录</small></div><p><span>设计输入 / 计算书</span><b>永久 + 版本</b></p><p><span>测试 / 签字记录</span><b>7 年</b></p><p><span>采购 / 收货记录</span><b>10 年</b></p><p><span>运行趋势数据</span><b>2 年热存</b></p><button className="fullPrimary" disabled title="需要项目管理员角色与正式保留政策后开放编辑">归档策略（只读）</button></aside></div>;
}

function RoadmapView({ notify }: { notify: Notify }) {
  const exportRoadmap=()=>downloadCsv(`fabflow-roadmap-${Date.now()}.csv`,["阶段","主题","交付内容","技术边界","时间"],roadmap);
  return <div className="roadmapLayout"><section className="card roadmapBoard"><div className="dataHead"><div><span>DELIVERY ROADMAP</span><h3>从演示状态迁移到真实数据的四个阶段</h3><p>底座与企业接口完成后，产品迭代主线集中到设计输入、设备材料选型、接口匹配和系统工程校验。</p></div><button onClick={()=>{exportRoadmap();notify("实施任务清单已下载")}}>导出任务清单</button></div>{roadmap.map((r, i) => <div className="roadmapRow" key={r[0]}><i>{String(i + 1).padStart(2, "0")}</i><span><b>{r[0]} · {r[1]}</b><small>{r[2]}</small></span><em>{r[3]}</em><time>{r[4]}</time></div>)}</section><aside className="card architectureBoard"><span>REFERENCE ARCHITECTURE</span><h3>推荐技术边界</h3><div className="architectureFlow"><div><b>Workspace Auth</b><small>身份与访问控制</small></div><i>↓</i><div><b>API / Queue</b><small>幂等、游标、重试、死信</small></div><i>↓</i><div><b>D1 + R2</b><small>对象、状态、文件与版本</small></div><i>↓</i><div><b>Facility Construction Management Software UI</b><small>工程工作台与审计视图</small></div></div><button className="fullPrimary" onClick={()=>void copyText("Workspace Auth → API / Queue → D1 + R2 → Facility Construction Management Software UI").then(()=>notify("技术方案摘要已复制")).catch(error=>notify(error instanceof Error?error.message:"复制失败"))}>复制技术方案摘要</button></aside></div>;
}
