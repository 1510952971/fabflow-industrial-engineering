"use client";

import { useMemo, useState } from "react";
import { downloadCsv, openMasterData } from "@/lib/client-actions";

type Notify = (message:string)=>void;

const fabs = [
  {code:"US-AZ-F3",name:"Arizona Fab 3",city:"Phoenix · US",region:"北美",stage:"施工与安装",progress:64,health:"warning",capex:12.4,area:186,gate:"G4",timezone:"UTC−7",systems:38,open:17},
  {code:"DE-DD-F1",name:"Dresden Smart Fab",city:"Dresden · DE",region:"欧洲",stage:"详细设计",progress:46,health:"good",capex:8.7,area:142,gate:"G3",timezone:"UTC+2",systems:31,open:8},
  {code:"JP-KM-F2",name:"Kumamoto Fab 2",city:"Kumamoto · JP",region:"亚太",stage:"调试与验证",progress:87,health:"good",capex:6.9,area:118,gate:"G5",timezone:"UTC+9",systems:29,open:5},
  {code:"SG-WF-EXP",name:"Woodlands Fab Expansion",city:"Singapore · SG",region:"亚太",stage:"基础设计",progress:28,health:"risk",capex:4.8,area:76,gate:"G2",timezone:"UTC+8",systems:22,open:24},
  {code:"CN-WX-F4",name:"Wuxi Fab 4",city:"Wuxi · CN",region:"中国",stage:"概念与选址",progress:14,health:"good",capex:5.6,area:93,gate:"G1",timezone:"UTC+8",systems:18,open:6},
];

const gates = [
  {id:"G1",name:"概念与选址",short:"Concept",owner:"战略规划",deliverables:12},
  {id:"G2",name:"基础设计",short:"Basic Design",owner:"总体设计",deliverables:28},
  {id:"G3",name:"详细设计",short:"Detailed Design",owner:"EPCM 联合组",deliverables:64},
  {id:"G4",name:"施工与安装",short:"Construction",owner:"现场建设",deliverables:42},
  {id:"G5",name:"调试与验证",short:"Cx / IQOQ",owner:"调试验证",deliverables:36},
  {id:"G6",name:"量产移交",short:"Handover",owner:"运营团队",deliverables:18},
];

const initialRfis = [
  {id:"RFI-2841",level:"critical",title:"VMB 排风支管与消防喷淋净距冲突",project:"Arizona Fab 3",discipline:"特气 × 消防",owner:"M. Chen",due:"今天",status:"待答复"},
  {id:"RFI-2837",level:"warning",title:"CDS Skid 基础荷载需结构复核",project:"Dresden Smart Fab",discipline:"化学品 × 结构",owner:"L. Weber",due:"07/18",status:"协调中"},
  {id:"RFI-2824",level:"normal",title:"UPW 回水主管标高调整确认",project:"Kumamoto Fab 2",discipline:"纯水 × 建筑",owner:"S. Tanaka",due:"07/20",status:"已答复"},
  {id:"RFI-2819",level:"warning",title:"设备 Hook-up 点表与 Vendor Data 不一致",project:"Woodlands Fab Expansion",discipline:"工艺 × 二次配",owner:"A. Lim",due:"逾期 2 天",status:"待答复"},
];

const documents = [
  {no:"F3-GAS-PID-4102",title:"特气 VMB 供应系统 P&ID",project:"Arizona Fab 3",discipline:"工艺管道",rev:"C03",status:"审批中",author:"J. Morales",date:"2026-07-15",comments:8},
  {no:"DDF1-CDS-LAY-2208",title:"CDS 设备层综合布置图",project:"Dresden Smart Fab",discipline:"化学品",rev:"B07",status:"已批准",author:"L. Weber",date:"2026-07-14",comments:0},
  {no:"KMF2-UPW-ISO-8115",title:"UPW 回水管道轴测图",project:"Kumamoto Fab 2",discipline:"纯水",rev:"D02",status:"待修改",author:"S. Tanaka",date:"2026-07-13",comments:12},
  {no:"SGWF-BIM-MEP-0036",title:"MEP 综合模型联审包",project:"Woodlands Fab Expansion",discipline:"BIM 综合",rev:"A12",status:"会签中",author:"A. Lim",date:"2026-07-12",comments:21},
];

function PageTop({actions}:{actions:React.ReactNode}){
  return <div className="moduleTop globalTop"><div><span>GLOBAL FAB CONTROL TOWER</span><h2>全球 FAB 建设与设计管理</h2><p>统一管理多厂区项目组合、阶段闸门、跨专业协同、全球标准与数字化交付</p></div><div className="moduleActions">{actions}</div></div>;
}

export function GlobalFabPage({notify:parentNotify}:{notify:Notify}){
  const notify:Notify=(message)=>{
    parentNotify(message);
  };
  const [view,setView]=useState("项目组合");
  const [region,setRegion]=useState("全部区域");
  const [selected,setSelected]=useState(fabs[0].code);
  const [rfis,setRfis]=useState(initialRfis);
  const [standardsRegion,setStandardsRegion]=useState("北美");
  const [approvedDocs,setApprovedDocs]=useState<string[]>([]);
  const shown=useMemo(()=>fabs.filter(f=>region==="全部区域"||f.region===region),[region]);
  const current=fabs.find(f=>f.code===selected)??fabs[0];
  return <>
    <PageTop actions={<><button className="softButton" onClick={()=>{downloadCsv("fabflow-global-fab-weekly-report.csv",["项目","区域","阶段","进度","开放问题"],fabs.map(f=>[f.name,f.region,f.stage,`${f.progress}%`,f.open]));notify("已生成全球项目周报")}}>生成周报</button><button className="primaryButton" onClick={()=>{openMasterData("projects");notify("新 FAB 项目向导已创建")}}>＋ 新建 FAB 项目</button></>}/>
    <div className="globalTabs">{["项目组合","设计协同","标准合规","文档版本"].map(x=><button key={x} className={view===x?"active":""} onClick={()=>setView(x)}><i>{x==="项目组合"?"◎":x==="设计协同"?"◇":x==="标准合规"?"✓":"▤"}</i><span>{x}</span><small>{x==="项目组合"?"5 个在建":x==="设计协同"?`${rfis.filter(r=>r.status!=="已答复").length} 项待办`:x==="标准合规"?"4 套标准包":"86 份交付物"}</small></button>)}</div>
    {view==="项目组合"&&<PortfolioView region={region} setRegion={setRegion} shown={shown} selected={selected} setSelected={setSelected} current={current} notify={notify}/>} 
    {view==="设计协同"&&<CollaborationView rfis={rfis} setRfis={setRfis} notify={notify}/>} 
    {view==="标准合规"&&<StandardsView region={standardsRegion} setRegion={setStandardsRegion} notify={notify}/>} 
    {view==="文档版本"&&<DocumentsView approved={approvedDocs} setApproved={setApprovedDocs} notify={notify}/>} 
  </>;
}

function PortfolioView({region,setRegion,shown,selected,setSelected,current,notify}:{region:string;setRegion:(x:string)=>void;shown:typeof fabs;selected:string;setSelected:(x:string)=>void;current:typeof fabs[number];notify:Notify}){
  return <>
    <div className="globalKpis">
      <section className="card"><span>全球在建 FAB</span><b>5<small>座</small></b><p><i className="goodDot"/>4 个国家 / 地区</p></section>
      <section className="card"><span>总洁净室面积</span><b>615<small>k m²</small></b><p>同比规划 +12.8%</p></section>
      <section className="card"><span>组合 CAPEX</span><b>$ 38.4<small>B</small></b><p>已承诺 72% · 预测偏差 +1.6%</p></section>
      <section className="card"><span>里程碑健康度</span><b>82<small>/100</small></b><p><i className="warningDot"/>1 个项目需管理关注</p></section>
      <section className="card"><span>开放设计问题</span><b>60<small>项</small></b><p className="redText">9 项影响关键路径</p></section>
    </div>
    <div className="portfolioLayout">
      <section className="card globalMapCard">
        <div className="globalSectionHead"><div><span>GLOBAL PROGRAM</span><h3>全球项目分布与健康度</h3></div><div className="regionFilter">{["全部区域","北美","欧洲","亚太","中国"].map(x=><button key={x} className={region===x?"active":""} onClick={()=>setRegion(x)}>{x}</button>)}</div></div>
        <div className="globalMap">
          <div className="latLines"><i/><i/><i/><i/></div><div className="land land1"/><div className="land land2"/><div className="land land3"/><div className="land land4"/>
          {fabs.map((f,i)=><button key={f.code} className={`mapPin pin${i+1} ${f.health} ${selected===f.code?"selected":""}`} onClick={()=>setSelected(f.code)} title={f.name}><i/><span>{f.code}</span></button>)}
          <div className="mapLegend"><span><i className="good"/>正常</span><span><i className="warning"/>关注</span><span><i className="risk"/>风险</span></div>
        </div>
        <div className="siteStrip">{shown.map(f=><button key={f.code} className={selected===f.code?"active":""} onClick={()=>setSelected(f.code)}><i className={f.health}/><span><b>{f.name}</b><small>{f.city} · {f.timezone}</small></span><em>{f.progress}%</em></button>)}</div>
      </section>
      <aside className="card projectFocus">
        <div className="focusTop"><span>{current.code}</span><i className={current.health}>{current.health==="good"?"正常":current.health==="warning"?"关注":"风险"}</i></div><h3>{current.name}</h3><p>{current.city} · {current.stage}</p>
        <div className="focusProgress"><div><span>总体进度</span><b>{current.progress}%</b></div><div><i style={{width:`${current.progress}%`}}/></div><small>当前阶段：{current.gate} · {gates.find(g=>g.id===current.gate)?.name}</small></div>
        <div className="focusMetrics"><div><span>核准 CAPEX</span><b>${current.capex}B</b></div><div><span>洁净室面积</span><b>{current.area}k m²</b></div><div><span>厂务系统</span><b>{current.systems}</b></div><div><span>开放问题</span><b className={current.open>15?"redText":""}>{current.open}</b></div></div>
        <div className="milestoneList"><h4>关键里程碑</h4><p><i className="done"/><span>30% 模型联审</span><b>已完成</b></p><p><i className="active"/><span>主要设备 PO 释放</span><b>07/24</b></p><p><i/><span>洁净室封闭</span><b>09/18</b></p><p><i/><span>Utility Ready</span><b>12/08</b></p></div>
        <button className="fullPrimary" onClick={()=>{openMasterData("projects",current.code);notify(`已打开 ${current.name} 项目数据`)}}>进入项目控制室 <span>→</span></button>
      </aside>
    </div>
    <section className="card gateBoard"><div className="globalSectionHead"><div><span>STAGE-GATE GOVERNANCE</span><h3>全球统一阶段闸门</h3></div><button onClick={()=>{openMasterData("workflowActions","stage_gate");notify("阶段闸门模板已打开")}}>管理闸门模板 →</button></div><div className="gateFlow">{gates.map((g,i)=><div className={i<3?"complete":i===3?"current":""} key={g.id}><div className="gateNode"><i>{i<3?"✓":g.id}</i><span><b>{g.name}</b><small>{g.short}</small></span></div><p>{g.deliverables} 项交付物</p><em>{g.owner}</em></div>)}</div></section>
  </>;
}

function CollaborationView({rfis,setRfis,notify}:{rfis:typeof initialRfis;setRfis:(x:typeof initialRfis)=>void;notify:Notify}){
  const [filter,setFilter]=useState("全部");
  const shown=rfis.filter(r=>filter==="全部"||r.status===filter);
  const resolve=(id:string)=>{setRfis(rfis.map(r=>r.id===id?{...r,status:"已答复"}:r));notify(`${id} 已关闭并同步至责任专业`)};
  return <div className="collabLayout">
    <section className="card coordinationMatrix"><div className="globalSectionHead"><div><span>DESIGN COORDINATION</span><h3>跨专业设计成熟度矩阵</h3></div><button onClick={()=>{openMasterData("workflowActions","模型联审");notify("已发起本周模型联审")}}>发起联审</button></div><div className="matrixTable"><table><thead><tr><th>专业系统</th><th>30% 模型</th><th>60% 模型</th><th>90% 模型</th><th>IFC 发布</th><th>开放冲突</th></tr></thead><tbody>{[
      ["工艺 / Tool Layout",100,100,82,38,12],["特气 / BSGS",100,94,76,32,17],["化学品 / CDS",100,89,68,24,21],["UPW / PCW",100,100,91,56,6],["HVAC / 排风",100,96,78,41,28],["电气 / I&C",100,92,71,36,19]
    ].map((r,i)=><tr key={String(r[0])}><td><i className={`disciplineIcon d${i}`}/><b>{r[0]}</b></td>{r.slice(1,5).map((v,j)=><td key={j}><span className={`maturity ${Number(v)>=90?"good":Number(v)>=60?"warn":"risk"}`}><i style={{width:`${v}%`}}/></span><small>{v}%</small></td>)}<td><b className={Number(r[5])>20?"redText":""}>{r[5]}</b></td></tr>)}</tbody></table></div></section>
    <aside className="card collabPulse"><div className="globalSectionHead"><div><span>WEEKLY PULSE</span><h3>本周协同脉搏</h3></div></div><div className="pulseScore"><div><span>78</span></div><section><b>总体协同效率良好</b><p>较上周提升 4 分</p></section></div><div className="pulseRows"><p><span>平均 RFI 响应</span><b>2.8 天</b></p><p><span>模型冲突关闭率</span><b>86%</b></p><p><span>逾期设计任务</span><b className="redText">14</b></p><p><span>跨区待确认事项</span><b>9</b></p></div><button className="fullPrimary" onClick={()=>{downloadCsv("fabflow-collaboration-weekly.csv",["指标","当前值"],[["总体协同效率","78"],["平均 RFI 响应","2.8 天"],["模型冲突关闭率","86%"],["逾期设计任务","14"]]);notify("协同周报已生成并登记")}}>生成并登记协同周报</button></aside>
    <section className="card rfiBoard"><div className="globalSectionHead"><div><span>RFI & ISSUE LOOP</span><h3>设计问题与 RFI 闭环</h3></div><div className="rfiFilters">{["全部","待答复","协调中","已答复"].map(x=><button key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>{x}</button>)}</div></div><div className="rfiList">{shown.map(r=><article key={r.id} className={`rfiRow ${r.level}`}><i>{r.level==="critical"?"!":r.level==="warning"?"△":"•"}</i><div className="rfiId"><b>{r.id}</b><span>{r.project}</span></div><div className="rfiTitle"><b>{r.title}</b><span>{r.discipline}</span></div><div className="rfiOwner"><span>责任人</span><b>{r.owner}</b></div><div className="rfiDue"><span>要求答复</span><b className={r.due.includes("逾期")?"redText":""}>{r.due}</b></div><span className={`statusPill ${r.status==="已答复"?"done":r.status==="协调中"?"progress":""}`}>{r.status}</span><button disabled={r.status==="已答复"} onClick={()=>resolve(r.id)}>{r.status==="已答复"?"已闭环":"答复并关闭"}</button></article>)}</div></section>
  </div>;
}

function StandardsView({region,setRegion,notify}:{region:string;setRegion:(x:string)=>void;notify:Notify}){
  const packs:Record<string,{code:string;name:string;items:string[];color:string}[]>={
    "北美":[{code:"SEMI",name:"SEMI 工厂与设备标准",items:["S2 设备安全","S6 排风","F20 特气组件","F47 电压暂降"],color:"blue"},{code:"NFPA",name:"NFPA / IFC 消防规范",items:["NFPA 55 特种气体","NFPA 318 洁净室","IFC Ch.50 危化品"],color:"orange"},{code:"FM",name:"FM Global 财产防损",items:["数据表 7-7","数据表 7-29","设备抗震锚固"],color:"purple"}],
    "欧洲":[{code:"EN",name:"EN 欧盟工程标准",items:["EN 13480 工业管道","EN 378 制冷系统","EN 1092 法兰"],color:"blue"},{code:"ATEX",name:"ATEX 防爆体系",items:["2014/34/EU","1999/92/EC","区域分类"],color:"orange"},{code:"VDI",name:"VDI 洁净技术",items:["VDI 2083","VDI 6022","德国水法 WHG"],color:"green"}],
    "亚太":[{code:"SEMI",name:"SEMI 国际标准包",items:["S2 / S6 / S14","F1 / F20 / F21","E10 / E30"],color:"blue"},{code:"ISO",name:"ISO 洁净与能效",items:["ISO 14644","ISO 50001","ISO 14001"],color:"green"},{code:"LOCAL",name:"项目属地法规",items:["日本高压气体保安法","新加坡消防规范","危化品许可"],color:"purple"}],
  };
  const list=packs[region]??packs["北美"];
  const checks=[
    ["法规与许可清单已冻结","Owner","已完成"],["危险介质最大存量已确认","EHS","已完成"],["消防策略取得 AHJ 原则认可","EPCM","进行中"],["设备 SEMI S2 报告已纳入采购要求","Procurement","进行中"],["抗震谱与锚固准则已发布","Structural","待开始"],["调试与验证主计划已批准","Cx Lead","待开始"]
  ];
  return <>
    <section className="card standardsHero"><div><span>REGIONAL STANDARD PACK</span><h2>属地化设计基准与标准包</h2><p>将全球统一工程标准与项目所在国法规合并为可执行的设计准则和审查清单</p></div><div className="standardsRegion">{["北美","欧洲","亚太"].map(x=><button className={region===x?"active":""} onClick={()=>setRegion(x)} key={x}>{x}<small>{x==="北美"?"US / CA / MX":x==="欧洲"?"EU / UK":"JP / SG / KR"}</small></button>)}</div></section>
    <div className="standardsGrid">{list.map((p,i)=><section className="card standardPack" key={p.code}><div className={`standardBadge ${p.color}`}>{p.code}</div><span>STANDARD PACKAGE 0{i+1}</span><h3>{p.name}</h3><div>{p.items.map(x=><p key={x}><i>✓</i>{x}</p>)}</div><footer><span><i className="goodDot"/>版本已冻结</span><button onClick={()=>{openMasterData("technicalRules",p.code);notify(`${p.name} 已打开`)}}>查看标准包 →</button></footer></section>)}</div>
    <div className="standardBottom"><section className="card gateChecklist"><div className="globalSectionHead"><div><span>GATE READINESS</span><h3>G3 详细设计启动条件</h3></div><div className="readiness"><b>67%</b><span><i style={{width:"67%"}}/></span></div></div>{checks.map((x,i)=><div className="checkRow" key={x[0]}><i className={i<2?"done":i<4?"progress":""}>{i<2?"✓":i<4?"•":""}</i><b>{x[0]}</b><span>{x[1]}</span><em className={i<2?"done":i<4?"progress":""}>{x[2]}</em><button onClick={()=>{openMasterData("workflowActions",String(x[0]));notify(`已打开：${x[0]}`)}}>查看证据</button></div>)}</section><aside className="card deviationCard"><span>STANDARD DEVIATION</span><h3>标准偏差申请</h3><div className="deviationRing"><b>7</b><small>开放申请</small></div><p><span>高风险</span><b>1</b></p><p><span>评审中</span><b>4</b></p><p><span>待项目总工批准</span><b>2</b></p><button className="fullPrimary" onClick={()=>{openMasterData("workflowActions","standard_deviation");notify("新标准偏差申请已创建")}}>＋ 新建偏差申请</button></aside></div>
  </>;
}

function DocumentsView({approved,setApproved,notify}:{approved:string[];setApproved:(x:string[])=>void;notify:Notify}){
  const approve=(no:string)=>{setApproved([...approved,no]);notify(`${no} 已完成电子会签`)};
  return <>
    <div className="documentKpis"><section className="card"><i className="bluebg">▤</i><span><b>12,486</b><small>受控文件</small></span><em>+184 本周</em></section><section className="card"><i className="orangebg">△</i><span><b>86</b><small>等待会签</small></span><em>14 项即将逾期</em></section><section className="card"><i className="greenbg">✓</i><span><b>98.2%</b><small>版本一致率</small></span><em>跨平台同步正常</em></section><section className="card"><i className="purplebg">◇</i><span><b>42</b><small>本周发布包</small></span><em>IFC / IFA / Vendor</em></section></div>
    <section className="card documentBoard"><div className="documentToolbar"><div className="searchBox">⌕<input placeholder="搜索文件编号、标题、项目或专业…"/><kbd>⌘ K</kbd></div><div><button onClick={()=>openMasterData("projects")}>项目主数据</button><button onClick={()=>openMasterData("workflowActions","专业")}>专业协同任务</button><button onClick={()=>{openMasterData("workflowActions","document_control");notify("新文档登记任务已创建")}}>＋ 登记文档任务</button></div></div><div className="documentTable"><table><thead><tr><th>文件编号 / 标题</th><th>项目</th><th>专业</th><th>当前版本</th><th>状态</th><th>编制人</th><th>更新时间</th><th>审查意见</th><th></th></tr></thead><tbody>{documents.map(d=>{const isApproved=approved.includes(d.no)||d.status==="已批准";return <tr key={d.no}><td><code>{d.no}</code><b>{d.title}</b></td><td>{d.project}</td><td>{d.discipline}</td><td><span className="revisionPill">{d.rev}</span></td><td><span className={`docStatus ${isApproved?"approved":d.status==="待修改"?"revise":"review"}`}>{isApproved?"已批准":d.status}</span></td><td>{d.author}</td><td>{d.date}</td><td><b className={d.comments>10?"redText":""}>{d.comments}</b></td><td><button disabled={isApproved} onClick={()=>approve(d.no)}>{isApproved?"已会签":"会签批准"}</button></td></tr>})}</tbody></table></div></section>
    <div className="documentBottom"><section className="card revisionTimeline"><div className="globalSectionHead"><div><span>REVISION HISTORY</span><h3>版本演进 · F3-GAS-PID-4102</h3></div><button onClick={()=>{downloadCsv("fabflow-document-revision-comparison.csv",["版本","阶段","日期","状态"],[["A01","概念设计","2026-02-18","完成"],["B01","30% 设计审查","2026-04-06","完成"],["B06","60% 联合审查","2026-06-02","完成"],["C03","90% 审批","2026-07-15","审批中"],["IFC","施工发布","2026-08-01","计划"]]);notify("版本对比清单已导出")}}>对比版本</button></div><div className="revisionFlow"><div className="done"><i>✓</i><span><b>A01</b><small>概念设计</small><em>2026-02-18</em></span></div><div className="done"><i>✓</i><span><b>B01</b><small>30% 设计审查</small><em>2026-04-06</em></span></div><div className="done"><i>✓</i><span><b>B06</b><small>60% 联合审查</small><em>2026-06-02</em></span></div><div className="active"><i>•</i><span><b>C03</b><small>90% 审批中</small><em>2026-07-15</em></span></div><div><i>D</i><span><b>IFC</b><small>施工发布</small><em>计划 2026-08-01</em></span></div></div></section><aside className="card deliverablePack"><span>TRANSMITTAL PACKAGE</span><h3>数字化交付包</h3><p><i>✓</i><span><b>PDF / 原生文件</b><small>图纸与计算书</small></span></p><p><i>✓</i><span><b>BIM / IFC / NWD</b><small>模型与属性数据</small></span></p><p><i>✓</i><span><b>设备数据与 BOM</b><small>Tag / Spec / Vendor Data</small></span></p><button className="fullPrimary" onClick={()=>{downloadCsv("fabflow-digital-deliverable-manifest.csv",["交付类别","内容","状态"],[["PDF / 原生文件","图纸与计算书","已纳入"],["BIM / IFC / NWD","模型与属性数据","已纳入"],["设备数据与 BOM","Tag / Spec / Vendor Data","已纳入"]]);notify("数字化交付包清单已生成")}}>生成交付包</button></aside></div>
  </>;
}
