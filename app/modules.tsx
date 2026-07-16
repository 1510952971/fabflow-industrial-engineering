"use client";

import { useEffect, useRef, useState } from "react";
import { copyText, downloadCsv, downloadText, openMasterData, parseCsv } from "@/lib/client-actions";
import { GlobalFabPage } from "./global-fab";
import { EngineeringExecutionPage } from "./engineering-execution";
import { ProgramControlsPage } from "./program-controls";
import { SystemEngineeringPage } from "./system-engineering";
import { DataFoundationPage } from "./data-foundation";
import { EquipmentFactoryPage } from "./equipment-factory";
import { MasterDataPage } from "./master-data";

type Notify = (message: string) => void;
type PointRow = { id: number; area: string; structure: string; thickness: number; points: number };

const systemClass: Record<string, string> = {
  "电子特气": "blue", "大宗气体": "green", "湿化学品": "purple", "超纯水": "cyan", "厂务公辅": "gray", "机台二次配": "orange",
};

const catalog = [
  { id: "VCR-4-EP", name: "VCR 面密封接头", system: "电子特气", material: "316L EP", pressure: 8.3, size: '1/4”', temp: 120, pack: "10 件/盒", price: 186 },
  { id: "TUBE-8-BA", name: "BA 不锈钢管", system: "大宗气体", material: "316L BA", pressure: 10.0, size: '1/2”', temp: 180, pack: "6 m/支", price: 92 },
  { id: "PFA-6-F", name: "PFA 扩口接头", system: "湿化学品", material: "HP PFA", pressure: 1.0, size: '3/8”', temp: 95, pack: "5 件/袋", price: 128 },
  { id: "UPW-PVDF", name: "PVDF 隔膜阀", system: "超纯水", material: "HP PVDF", pressure: 1.6, size: 'DN15', temp: 90, pack: "1 件/盒", price: 460 },
  { id: "CDA-BV25", name: "CDA 球阀", system: "厂务公辅", material: "304L", pressure: 2.5, size: 'DN25', temp: 150, pack: "1 件/盒", price: 315 },
  { id: "TOOL-KIT", name: "机台 Hook-up 套件", system: "机台二次配", material: "混合组件", pressure: 0.8, size: '标准套件', temp: 80, pack: "1 套/箱", price: 2380 },
];

async function createBomRecords(items:Record<string,unknown>[]) {
  const response = await fetch("/api/master-data", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({entity:"bomItems",items:items.map(item=>({projectId:"proj-fab2a",quantity:1,unit:"件",unitPriceCny:0,wastePct:5,sourceType:"manual",status:"draft",...item}))}) });
  const payload = await response.json();
  if(!response.ok) throw new Error(payload.error||"BOM 写入失败");
  return payload.imported as number;
}

export function ModuleRouter({ active, notify }:{ active:string; notify:Notify }) {
  if (active === "全球建设管理") return <GlobalFabPage notify={notify}/>;
  if (active === "工程执行中心") return <EngineeringExecutionPage notify={notify}/>;
  if (active === "计划与供应链") return <ProgramControlsPage notify={notify}/>;
  if (active === "系统工程域") return <SystemEngineeringPage notify={notify}/>;
  if (active === "数据底座与协同") return <DataFoundationPage notify={notify}/>;
  if (active === "设备工厂协同") return <EquipmentFactoryPage notify={notify}/>;
  if (active === "工程主数据录入") return <MasterDataPage notify={notify}/>;
  if (active === "介质参数录入" || active === "结构紧固件计算") return <CalculationPage notify={notify}/>;
  if (active === "管路接头选型" || active === "厂务大型设备库") return <LibraryPage notify={notify} equipment={active === "厂务大型设备库"}/>;
  if (active === "机台二次配批量算量") return <MachinePage notify={notify}/>;
  if (active === "合规校验中心") return <CompliancePage notify={notify}/>;
  if (active === "BOM 成本报表") return <BomPage notify={notify}/>;
  if (active === "全局工具箱") return <ToolsPage notify={notify}/>;
  return <ArchivePage/>;
}

function PageTop({ eyebrow, title, desc, actions }:{eyebrow:string;title:string;desc:string;actions?:React.ReactNode}) {
  return <div className="moduleTop"><div><span>{eyebrow}</span><h2>{title}</h2><p>{desc}</p></div>{actions&&<div className="moduleActions">{actions}</div>}</div>;
}

function CalculationPage({notify}:{notify:Notify}) {
  const pointFile=useRef<HTMLInputElement>(null);
  const [thickness,setThickness] = useState(2);
  const [layers,setLayers] = useState("双层结构");
  const [material,setMaterial] = useState("304 不锈钢");
  const [rows,setRows] = useState<PointRow[]>([
    {id:1,area:"VMB-01 左侧板",structure:"双层",thickness:2,points:24},
    {id:2,area:"VMB-01 右侧板",structure:"双层",thickness:2,points:24},
    {id:3,area:"阀件安装背板",structure:"单层",thickness:3,points:36},
  ]);
  const bolt = thickness <= 2 ? "M5 × 8" : thickness <= 4 ? "M5 × 12" : "M6 × 16";
  const torque = thickness > 4 ? 6.2 : 4.8;
  const total = rows.reduce((sum,row)=>sum+row.points*4,0);
  const changeRow = (id:number,key:keyof PointRow,value:string|number) => setRows(rows.map(r=>r.id===id?{...r,[key]:value}:r));
  const importPoints=async(file:File)=>{try{const matrix=parseCsv(await file.text());if(matrix.length<2)throw new Error("点位表必须包含表头和数据");const header=matrix[0];const at=(name:string)=>header.findIndex(x=>x===name);const imported=matrix.slice(1).map((cells,index)=>({id:Date.now()+index,area:cells[at("装配区域")]||cells[0]||`点位 ${index+1}`,structure:cells[at("结构")]||"双层",thickness:Number(cells[at("板厚")])||2,points:Number(cells[at("点位数量")])||0}));setRows(imported);notify(`已导入 ${imported.length} 组点位`)}catch(error){notify(error instanceof Error?error.message:"点位表导入失败")}finally{if(pointFile.current)pointFile.current.value=""}};
  const exportCalculation=()=>{downloadText(`fastener-calculation-${Date.now()}.txt`,[`FabFlow 紧固件计算书`,`结构：${layers}`,`材质：${material}`,`板厚：${thickness} mm`,`推荐规格：${bolt}`,`建议扭矩：${torque} N·m`,`计算数量：${total} 套`,`采购数量（含 5%）：${Math.ceil(total*1.05)} 套`,"",...rows.map((row,index)=>`${index+1}. ${row.area} / ${row.structure} / ${row.thickness}mm / ${row.points} 点`)].join("\r\n"));notify("计算书已下载")};
  const addFasteners=async()=>{try{await createBomRecords([{itemCode:`BOLT-${bolt.replace(/\s/g,"")}`,itemName:"四组合螺栓副",specification:`${bolt} · ${material}`,quantity:Math.ceil(total*1.05),unit:"套",unitPriceCny:2.6,sourceType:"calculation",sourceId:"fastener-engine"}]);notify(`${bolt} 已写入 D1 项目 BOM`)}catch(error){notify(error instanceof Error?error.message:"BOM 写入失败")}};
  const applyLocking=async()=>{try{await createBomRecords([{itemCode:"WASHER-M5-TOOTH",itemName:"M5 带齿防松垫圈",specification:`${material} / ${bolt}`,quantity:Math.ceil(total*1.05),unit:"件",unitPriceCny:.8,sourceType:"calculation",sourceId:"fastener-locking"}]);notify("已应用带齿垫圈方案并写入 D1 BOM")}catch(error){notify(error instanceof Error?error.message:"防松方案写入失败")}};
  return <>
    <PageTop eyebrow="FASTENER ENGINE" title="参数录入与结构紧固件计算" desc="基于板厚、结构形式与装配点位，实时计算规格、扭矩与采购数量" actions={<><button className="softButton" onClick={()=>pointFile.current?.click()}>导入点位表</button><input ref={pointFile} type="file" accept=".csv,text/csv" hidden onChange={event=>event.target.files?.[0]&&void importPoints(event.target.files[0])}/><button className="primaryButton" onClick={exportCalculation}>下载计算书</button></>}/>
    <div className="moduleGrid calcGrid">
      <section className="card moduleCard span8">
        <div className="moduleCardTitle"><div><i className="titleIcon bluebg">◇</i><span><b>装配参数</b><small>输入数据将自动触发计算</small></span></div><em>01 / INPUT</em></div>
        <div className="floatingFields">
          <label><span>面板厚度</span><input id="panel-thickness-input" type="number" value={thickness} step="0.5" onChange={e=>setThickness(+e.target.value)}/><b>mm</b></label>
          <label><span>结构形式</span><select value={layers} onChange={e=>setLayers(e.target.value)}><option>双层结构</option><option>单层结构</option><option>夹层结构</option></select></label>
          <label><span>面板材质</span><select value={material} onChange={e=>setMaterial(e.target.value)}><option>304 不锈钢</option><option>316L 不锈钢</option><option>镀锌钢板</option></select></label>
          <label><span>安装环境</span><select defaultValue="低振动"><option>低振动</option><option>中振动</option><option>高振动</option></select></label>
        </div>
        <div className="rangeVisual"><div><span>板厚适配区间</span><b>{thickness} mm</b></div><div className="scale"><i style={{width:`${Math.min(100,thickness/8*100)}%`}}/><em style={{left:`${Math.min(97,thickness/8*100)}%`}}/></div><div className="scaleLabels"><span>0.8</span><span>2.0</span><span>4.0</span><span>6.0</span><span>8.0 mm</span></div></div>
      </section>
      <section className="card moduleCard span4 resultPanel">
        <div className="moduleCardTitle"><div><i className="titleIcon greenbg">⌁</i><span><b>实时计算结果</b><small><i className="live"/>已通过规则校核</small></span></div></div>
        <span className="metricLabel">推荐螺栓规格</span><strong className="heroNumber">{bolt}</strong><p className="mutedText">{material} · 十字槽盘头四组合螺栓副</p>
        <div className="specTiles"><div><span>建议扭矩</span><b>{torque}<small>N·m</small></b></div><div><span>采购数量</span><b>{Math.ceil(total*1.05)}<small>套</small></b></div></div>
        <button className="fullPrimary" onClick={()=>void addFasteners()}>加入项目 BOM <span>→</span></button>
      </section>
      <section className="card moduleCard span12">
        <div className="moduleCardTitle"><div><i className="titleIcon orangebg">!</i><span><b>装配风险提示</b><small>随参数变化自动生成工程建议</small></span></div><span className="warningTag">2 项建议</span></div>
        <div className="riskCards"><div className="riskNotice amberNotice"><i>!</i><span><b>薄板装配防松</b><small>{thickness<=2?"当前板厚较薄，建议加装带齿垫圈或使用螺纹锁固胶。":"当前板厚满足常规装配要求。"}</small></span><button onClick={()=>void applyLocking()}>应用方案</button></div><div className="riskNotice redNotice"><i>×</i><span><b>振动工况复核</b><small>{layers}需确保有效啮合长度不小于 1.5D。</small></span><button onClick={()=>{const input=document.getElementById("panel-thickness-input");input?.scrollIntoView({behavior:"smooth",block:"center"});(input as HTMLInputElement|null)?.focus();notify("已定位对应参数")}}>定位参数</button></div></div>
      </section>
      <section className="card moduleCard span12 tableCard">
        <div className="moduleCardTitle"><div><i className="titleIcon purplebg">▤</i><span><b>批量点位清单</b><small>共 {rows.length} 组点位 · 自动汇总 {total} 套紧固件</small></span></div><button className="softButton" onClick={()=>setRows([...rows,{id:Date.now(),area:"新装配点位",structure:"双层",thickness,points:12}])}>＋ 添加点位</button></div>
        <div className="dataTable"><table><thead><tr><th>序号</th><th>装配区域</th><th>结构</th><th>板厚 / mm</th><th>点位数量</th><th>计算规格</th><th>螺栓套数</th><th></th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.id}><td>{String(i+1).padStart(2,"0")}</td><td><input value={r.area} onChange={e=>changeRow(r.id,"area",e.target.value)}/></td><td>{r.structure}</td><td><input type="number" value={r.thickness} onChange={e=>changeRow(r.id,"thickness",+e.target.value)}/></td><td><input type="number" value={r.points} onChange={e=>changeRow(r.id,"points",+e.target.value)}/></td><td><b className="blueText">{r.thickness<=2?"M5 × 8":"M5 × 12"}</b></td><td>{r.points*4}</td><td><button className="rowDelete" onClick={()=>setRows(rows.filter(x=>x.id!==r.id))}>×</button></td></tr>)}</tbody><tfoot><tr><td colSpan={6}>合计</td><td>{total} 套</td><td/></tr></tfoot></table></div>
      </section>
    </div>
  </>;
}

function LibraryPage({notify,equipment}:{notify:Notify;equipment:boolean}) {
  const [system,setSystem] = useState("全部系统"); const [material,setMaterial] = useState("全部材质"); const [query,setQuery] = useState(""); const [selected,setSelected] = useState<string[]>([]); const [viewMode,setViewMode]=useState<"card"|"compact">("card");
  const equipmentCatalog = [
    { id:"VMB-4L",name:"四路全自动 VMB",system:"电子特气",material:"316L EP",pressure:8.3,size:"4 Line",temp:60,pack:"整机",price:168000 },
    { id:"CDS-200",name:"双桶化学品供应单元",system:"湿化学品",material:"PTFE / PFA",pressure:0.7,size:"200 L",temp:80,pack:"整机",price:236000 },
    { id:"UPW-SKID",name:"UPW 抛光混床 Skid",system:"超纯水",material:"HP PVDF",pressure:1.0,size:"40 m³/h",temp:45,pack:"整机",price:420000 },
  ];
  const source = equipment ? equipmentCatalog : catalog;
  const shown = source.filter(x=>(system==="全部系统"||x.system===system)&&(material==="全部材质"||x.material.includes(material))&&(x.name.toLowerCase().includes(query.toLowerCase())||x.id.toLowerCase().includes(query.toLowerCase())));
  const addSelected=async()=>{if(!selected.length){notify("请先选择至少一项物料");return}try{const targets=source.filter(item=>selected.includes(item.id));await createBomRecords(targets.map(item=>({itemCode:item.id,itemName:item.name,specification:`${item.size} · ${item.material}`,quantity:1,unit:equipment?"台":"件",unitPriceCny:item.price,sourceType:equipment?"equipment":"catalog",sourceId:item.id})));notify(`已将 ${targets.length} 项写入 D1 项目 BOM`);setSelected([])}catch(error){notify(error instanceof Error?error.message:"BOM 写入失败")}};
  return <>
    <PageTop eyebrow={equipment?"FACILITY EQUIPMENT":"SMART CATALOG"} title={equipment?"厂务大型设备库":"管路与设备选型库"} desc={equipment?"标准化设备模块、技术参数与预算价格统一管理":"多维度筛选适配介质、材质、耐压、管径与温度工况"} actions={<button className="primaryButton" disabled={!selected.length} onClick={()=>void addSelected()}>写入 BOM · {selected.length}</button>}/>
    <section className="card filterPanel"><div className="searchBox">⌕<input placeholder="搜索物料名称、规格或编码…" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌘ K</kbd></div><div className="filterRow"><span>流体系统</span>{["全部系统","电子特气","大宗气体","湿化学品","超纯水","厂务公辅"].map(x=><button className={system===x?"active":""} onClick={()=>setSystem(x)} key={x}>{x}</button>)}</div><div className="filterRow"><span>材质</span>{["全部材质","316L","PFA","PVDF","304L"].map(x=><button className={material===x?"active":""} onClick={()=>setMaterial(x)} key={x}>{x}</button>)}</div></section>
    <div className="catalogHeader"><p>找到 <b>{shown.length}</b> 项匹配结果 <span>· 按工况匹配度排序</span></p><div><button className={viewMode==="card"?"active":""} onClick={()=>setViewMode("card")}>卡片视图</button><button className={viewMode==="compact"?"active":""} onClick={()=>setViewMode("compact")}>紧凑视图</button></div></div>
    <div className={`catalogGrid ${viewMode==="compact"?"compact":""}`}>{shown.map((item,index)=><article className="card catalogCard" key={item.id}><div className="catalogVisual"><div className="pipeShape"><i/><i/><i/></div><span>匹配度 {97-index*4}%</span></div><div className="catalogBody"><div className="catalogTitle"><div><small>{item.id}</small><h3>{item.name}</h3></div><span className={`chip ${systemClass[item.system]}`}>{item.system}</span></div><div className="catalogSpecs"><div><span>材质</span><b>{item.material}</b></div><div><span>耐压</span><b>{item.pressure} MPa</b></div><div><span>规格</span><b>{item.size}</b></div><div><span>耐温</span><b>{item.temp}°C</b></div></div><div className="pressureMeter"><span>耐压区间</span><div><i style={{width:`${Math.min(100,item.pressure*10)}%`}}/></div><b>{item.pressure} MPa</b></div><div className="catalogFoot"><span><small>参考单价</small><b>¥ {item.price.toLocaleString()}</b> / {item.pack}</span><button className={selected.includes(item.id)?"addedButton":""} onClick={()=>setSelected(selected.includes(item.id)?selected.filter(x=>x!==item.id):[...selected,item.id])}>{selected.includes(item.id)?"✓ 已选择":"＋ 选择"}</button></div></div></article>)}</div>
  </>;
}

function MachinePage({notify}:{notify:Notify}) {
  const [category,setCategory]=useState("刻蚀 ETCH"); const [count,setCount]=useState(8); const [model,setModel]=useState("AX-300 高密度等离子刻蚀机");
  const groups=[{name:"工艺气路",icon:"⌁",color:"blue",items:18,amount:126},{name:"超纯水",icon:"≈",color:"cyan",items:9,amount:48},{name:"化学品",icon:"◇",color:"purple",items:8,amount:32},{name:"真空排气",icon:"◌",color:"gray",items:7,amount:64}];
  const addAll=async()=>{try{await createBomRecords(groups.map(g=>({itemCode:`${category.split(" ")[0]}-${g.color.toUpperCase()}`,itemName:`${model} · ${g.name}`,specification:`${g.items} 项 / 单台`,quantity:g.amount*count,unit:"件",unitPriceCny:0,sourceType:"equipment",sourceId:model})));notify(`${count} 台机台的 4 类配套物料已写入 D1 BOM`)}catch(error){notify(error instanceof Error?error.message:"BOM 写入失败")}};
  return <>
    <PageTop eyebrow="TOOL HOOK-UP" title="机台二次配批量算量" desc="按机台型号自动展开标准配套物料，批量生成气、水、化学品与真空工程量" actions={<button className="primaryButton" onClick={()=>void addAll()}>全部写入项目 BOM</button>}/>
    <div className="machineTabs">{["刻蚀 ETCH","薄膜 PVD","清洗 WET","研磨 CMP","扩散 DIFF"].map(x=><button key={x} className={category===x?"active":""} onClick={()=>setCategory(x)}>{x}<small>{x.split(" ")[1]}</small></button>)}</div>
    <section className="card machineConfig"><div><span>当前机台型号</span><select value={model} onChange={e=>setModel(e.target.value)}><option>AX-300 高密度等离子刻蚀机</option><option>ICP-900 金属刻蚀机</option><option>DRIE-500 深硅刻蚀机</option></select></div><div className="countControl"><span>机台数量</span><button onClick={()=>setCount(Math.max(1,count-1))}>−</button><b>{count}</b><button onClick={()=>setCount(count+1)}>＋</button><small>台</small></div><div className="configStatus"><i/>标准配置 V3.2<small>已匹配 42 项单台物料</small></div></section>
    <div className="kitGrid">{groups.map(g=><section className="card kitCard" key={g.name}><div className={`kitIcon ${g.color}`}>{g.icon}</div><div><span>SECONDARY SYSTEM</span><h3>{g.name}</h3><p>单台 {g.items} 项物料 · 标准配套包</p></div><div className="kitMetrics"><div><span>单台用量</span><b>{g.amount}</b><small>件</small></div><em>× {count} 台</em><div><span>总工程量</span><b>{g.amount*count}</b><small>件</small></div></div><button onClick={()=>{openMasterData("bomItems",g.name);notify(`${g.name}配套物料明细已打开`)}}>查看物料明细 <span>→</span></button></section>)}</div>
    <section className="card machineSummary"><div className="bigDonut"><span><b>{count*270}</b><small>总配件数量</small></span></div><div className="summaryCopy"><span>BATCH QUANTITY</span><h2>{count} 台 {category.split(" ")[0]}机台工程量</h2><p>{model} · 含 8% 现场安装余量</p><div className="summaryLegend">{groups.map(g=><span key={g.name}><i className={g.color}/>{g.name} <b>{g.amount*count}</b></span>)}</div></div><div className="summaryCost"><span>预估材料成本</span><b>¥ {(count*186420).toLocaleString()}</b><small>平均 ¥186,420 / 台</small></div></section>
  </>;
}

function CompliancePage({notify}:{notify:Notify}) {
  const [fixed,setFixed]=useState<number[]>([]);
  const [riskFilter,setRiskFilter]=useState<"all"|"fatal"|"warn"|"info">("all");
  const [checkedAt,setCheckedAt]=useState("刚刚");
  const risks=[
    {level:"fatal",system:"电子特气",title:"Cl₂ 介质与 EPDM 密封材料不兼容",location:"VMB-02 / 阀门 V-204",rule:"SEMI F20-0520 §8.3",solution:"推荐更换为 PCTFE 阀座与 FFKM 密封"},
    {level:"warn",system:"机台二次配",title:"薄板装配未配置防松措施",location:"ETCH-AX300 / 背板点位 B12",rule:"企业标准 FAB-ME-014",solution:"增加带齿垫圈，扭矩调整至 4.8 N·m"},
    {level:"warn",system:"超纯水",title:"支管流速超过推荐上限",location:"UPW-L2 / 支管 P-118",rule:"GB 50073-2013",solution:"管径由 DN15 调整为 DN20"},
    {level:"info",system:"大宗气体",title:"氮气末端建议增设颗粒过滤器",location:"BSGS-N2 / 支路 N-08",rule:"SEMI F1-0819",solution:"选配 0.003 μm UHP 过滤器"},
  ];
  const shownRisks=risks.map((risk,index)=>({risk,index})).filter(({risk})=>riskFilter==="all"||risk.level===riskFilter);
  const score=92+fixed.length*2;
  return <>
    <PageTop eyebrow="COMPLIANCE CENTER" title="合规校验中心" desc="基于 SEMI、国家标准与企业规则库，自动识别材质、压力和装配风险" actions={<><button className="softButton" onClick={()=>openMasterData("technicalRules")}>校验规则 128 条</button><button className="primaryButton" onClick={()=>{setRiskFilter("all");setCheckedAt(new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"}));notify("已完成全项目重新校验")}}>重新校验</button></>}/>
    <section className="card complianceHero"><div className={`statusOrb ${fixed.includes(0)?"safe":"danger"}`}>{fixed.includes(0)?"✓":"!"}</div><div><span>PROJECT STATUS</span><h2>{fixed.includes(0)?"项目已达到可发布状态":"存在 1 项致命风险，已拦截发布"}</h2><p>上次校验：{checkedAt} · 覆盖 36 个设计模块、1,284 项物料</p></div><div className="complianceScore"><span>综合合规得分</span><b>{Math.min(100,score)}<small>/ 100</small></b></div><div className="statusStats"><div><b>31</b><span>检查合格</span></div><div><b>{fixed.includes(0)?0:1}</b><span>致命拦截</span></div><div><b>{2-fixed.filter(x=>x===1||x===2).length}</b><span>警告待处理</span></div></div></section>
    <div className="complianceLayout"><aside className="card ruleNav"><h3>校验分类</h3>{[["全部结果",36],["介质与材料",8],["压力与温度",6],["结构与装配",12],["管径与流速",5],["文件完整性",5]].map((x,i)=><button className={i===0?"active":""} key={String(x[0])} onClick={()=>openMasterData("technicalRules",String(x[0]))}><span>{x[0]}</span><b>{x[1]}</b></button>)}<div><span>规则库版本</span><b>Fab Rules 2026.07</b><small>已是最新版本</small></div></aside><section className="riskList"><div className="riskListHead"><div><button className={riskFilter==="all"?"active":""} onClick={()=>setRiskFilter("all")}>全部 4</button><button className={riskFilter==="fatal"?"active":""} onClick={()=>setRiskFilter("fatal")}>致命 1</button><button className={riskFilter==="warn"?"active":""} onClick={()=>setRiskFilter("warn")}>警告 2</button><button className={riskFilter==="info"?"active":""} onClick={()=>setRiskFilter("info")}>建议 1</button></div><button onClick={()=>downloadCsv("fabflow-compliance-report.csv",["\u7b49\u7ea7","\u7cfb\u7edf","\u95ee\u9898","\u4f4d\u7f6e","\u89c4\u5219","\u63a8\u8350\u65b9\u6848"],shownRisks.map(({risk})=>[risk.level,risk.system,risk.title,risk.location,risk.rule,risk.solution]))}>导出校验报告</button></div>{shownRisks.map(({risk:r,index:i})=><article className={`card riskItem ${r.level} ${fixed.includes(i)?"resolved":""}`} key={r.title}><i>{fixed.includes(i)?"✓":r.level==="fatal"?"×":r.level==="warn"?"!":"i"}</i><div className="riskMain"><div><span className={`chip ${systemClass[r.system]}`}>{r.system}</span><small>{r.rule}</small></div><h3>{fixed.includes(i)?`已修正：${r.title}`:r.title}</h3><p>⌖ {r.location}</p><div className="solution"><b>推荐方案</b><span>{r.solution}</span></div></div><div className="riskActions"><button onClick={()=>{openMasterData("technicalRules",r.rule);notify(`已定位到 ${r.location}`)}}>定位参数</button><button disabled={fixed.includes(i)} onClick={()=>{setFixed([...fixed,i]);notify("已应用推荐修正并重新校验")}}>{fixed.includes(i)?"已修正":"一键修正"}</button></div></article>)}</section></div>
  </>;
}

type BomRow = { id: string; itemCode: string; itemName: string; specification: string; quantity: number; unit: string; unitPriceCny: number; wastePct: number; systemId?: string | null; };

function BomPage({notify}:{notify:Notify}) {
  const [margin,setMargin]=useState(8); const [selected,setSelected]=useState<string[]>([]); const [rows,setRows]=useState<BomRow[]>([]); const [query,setQuery]=useState(""); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  useEffect(()=>{fetch("/api/master-data?entity=bomItems",{cache:"no-store"}).then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.error||"BOM 数据加载失败");setRows(payload.data?.bomItems??[])}).catch(cause=>setError(cause instanceof Error?cause.message:"BOM 数据加载失败")).finally(()=>setLoading(false))},[]);
  const shown=rows.filter(r=>!query||`${r.itemCode} ${r.itemName} ${r.specification}`.toLowerCase().includes(query.toLowerCase()));
  const sum=shown.reduce((s,r)=>s+r.unitPriceCny*Math.ceil(r.quantity*(1+margin/100)),0);
  const totalQuantity=shown.reduce((s,r)=>s+Math.ceil(r.quantity*(1+margin/100)),0);
  const toggleAll=()=>setSelected(selected.length===shown.length?[]:shown.map(r=>r.id));
  const exportBom=()=>{downloadCsv(`fabflow-bom-${Date.now()}.csv`,["物料编码","物料名称","规格","设计数量","采购数量","单位","单价(CNY)","小计(CNY)"],shown.map(r=>[r.itemCode,r.itemName,r.specification,r.quantity,Math.ceil(r.quantity*(1+margin/100)),r.unit,r.unitPriceCny,Math.ceil(r.quantity*(1+margin/100))*r.unitPriceCny]));notify("BOM CSV 已下载，可直接用 Excel 打开")};
  const copyCad=async()=>{try{await copyText(shown.map(r=>`${r.itemCode}\t${r.itemName}\t${r.specification}\t${Math.ceil(r.quantity*(1+margin/100))} ${r.unit}`).join("\n"));notify("CAD 标注文本已复制到剪贴板")}catch(error){notify(error instanceof Error?error.message:"复制失败")}};
  return <>
    <PageTop eyebrow="BILL OF MATERIALS" title="BOM 成本报表" desc="统一管理物料数量、采购余量与成本分项，支持多格式专业交付" actions={<><button className="exportButton" onClick={()=>void copyCad()}>复制 CAD 文本</button><button className="exportButton" onClick={()=>downloadText(`fabflow-bom-note-${Date.now()}.txt`,`FabFlow 项目 BOM 设计说明\n物料条目：${shown.length}\n采购余量：${margin}%\n成本合计：CNY ${sum.toFixed(2)}\n导出时间：${new Date().toISOString()}`)}>生成设计说明</button><button className="primaryButton" onClick={exportBom}>导出 Excel / CSV</button></>}/>
    {error&&<div className="dataBackendState"><i>!</i><span><b>BOM 未能读取 D1</b><small>{error}</small></span></div>}
    <div className="bomKpis"><section className="card"><span>物料条目</span><b>{rows.length}<small>项</small></b><p>当前项目已持久化 BOM</p></section><section className="card"><span>物料总数量</span><b>{totalQuantity}<small>件</small></b><p>已含 {margin}% 采购余量</p></section><section className="card"><span>预估材料成本</span><b>¥ {sum.toLocaleString()}</b><p className="greenText">根据当前单价实时计算</p></section><section className="card costMini"><div className="miniDonut"/><span>成本构成</span><p>按系统与物料分类汇总</p></section></div>
    <section className="card marginControl"><div><span>采购余量</span><b>{margin}%</b><small>建议范围 5% — 15%，数量与成本实时联动</small></div><input type="range" min="5" max="15" value={margin} onChange={e=>setMargin(+e.target.value)}/><div className="rangeTicks"><span>5%</span><span>10%</span><span>15%</span></div></section>
    <section className="card tableCard bomTable"><div className="bomToolbar"><div className="searchBox">⌕<input placeholder="搜索 BOM 编码、名称或规格…" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>{shown.length} 项</kbd></div><div><button onClick={()=>openMasterData("bomItems")}>编辑 BOM 数据</button><button onClick={()=>window.print()}>打印预览</button></div></div><div className="dataTable"><table><thead><tr><th><input type="checkbox" checked={shown.length>0&&selected.length===shown.length} onChange={toggleAll}/></th><th>物料编码</th><th>物料名称</th><th>流体系统</th><th>规格 / 材质</th><th>单价</th><th>设计量</th><th>采购量</th><th>小计</th></tr></thead><tbody>{loading?<tr><td colSpan={9}>正在读取 D1 BOM…</td></tr>:shown.map((r)=>{const buy=Math.ceil(r.quantity*(1+margin/100));const systemName=r.systemId?({"sys-utl":"动力公用工程","sys-cr":"洁净室与洁净包","sys-wtr":"纯水与废水","sys-exh":"工艺排风","sys-fire":"消防与生命安全","sys-ctrl":"机电自控与能源管理"} as Record<string,string>)[r.systemId]||"未分配":"未分配";return <tr key={r.id}><td><input type="checkbox" checked={selected.includes(r.id)} onChange={()=>setSelected(selected.includes(r.id)?selected.filter(x=>x!==r.id):[...selected,r.id])}/></td><td><code>{r.itemCode}</code></td><td><b>{r.itemName}</b></td><td><span className={`chip ${systemClass[systemName]||"gray"}`}>{systemName}</span></td><td>{r.specification}</td><td>¥ {r.unitPriceCny}</td><td>{r.quantity} {r.unit}</td><td><b className="blueText">{buy} {r.unit}</b></td><td>¥ {(buy*r.unitPriceCny).toLocaleString()}</td></tr>})}</tbody></table></div><div className="tableFooter"><span>已选择 {selected.length} 项</span><b>当前页成本合计：¥ {sum.toLocaleString()}</b></div></section>
  </>;
}

function ToolsPage({notify}:{notify:Notify}) {
  const [tab,setTab]=useState("压力"); const [value,setValue]=useState(0.7); const [history,setHistory]=useState([["0.700 MPa","101.526 psi"],["25.4 mm","1.000 inch"],["4.8 N·m","3.540 lbf·ft"],["18.2 MΩ·cm","0.0549 μS/cm"]]); const [expanded,setExpanded]=useState(false);
  const configs:Record<string,{from:string;to:string;factor:number;quick:number[]}>= {"压力":{from:"MPa",to:"psi",factor:145.0377,quick:[0.5,0.7,6.895]},"尺寸":{from:"mm",to:"inch",factor:0.0393701,quick:[6.35,12.7,25.4]},"扭矩":{from:"N·m",to:"lbf·ft",factor:0.737562,quick:[4.8,6.2,10]},"纯水电阻率":{from:"MΩ·cm",to:"μS/cm",factor:1,quick:[10,15,18.2]}};
  const c=configs[tab]; const result=tab==="纯水电阻率"?(value?1/value:0):value*c.factor;
  return <>
    <PageTop eyebrow="ENGINEERING TOOLBOX" title="全局工程工具箱" desc="单位换算、介质材质禁忌与标准扭矩速查，无需离开当前项目"/>
    <div className="toolPageTabs">{Object.keys(configs).map(x=><button key={x} className={tab===x?"active":""} onClick={()=>{setTab(x);setValue(configs[x].quick[0])}}>{x}</button>)}</div>
    <div className="toolsLayout"><section className="card bigConverter"><div className="moduleCardTitle"><div><i className="titleIcon bluebg">⇄</i><span><b>{tab}单位换算</b><small>双向实时计算 · 工程精度</small></span></div><span className="verified">实时联动</span></div><div className="conversionFields"><label><span>输入值 · {c.from}</span><input type="number" value={value} onChange={e=>{const next=+e.target.value;setValue(next);setHistory(prev=>[[`${next} ${c.from}`,`${(tab==="纯水电阻率"?(next?1/next:0):next*c.factor).toFixed(4)} ${c.to}`],...prev].slice(0,6))}}/><b>{c.from}</b></label><button onClick={()=>setValue(result)}>⇄</button><label><span>换算结果 · {c.to}</span><input readOnly value={result.toFixed(tab==="压力"?3:4)}/><b>{c.to}</b></label></div><div className="quickValues"><span>常用标准值</span>{c.quick.map(q=><button key={q} onClick={()=>setValue(q)}>{q} {c.from}</button>)}</div><div className="formula"><span>换算公式</span><code>{tab==="纯水电阻率"?"电导率 = 1 ÷ 电阻率":`1 ${c.from} = ${c.factor} ${c.to}`}</code></div></section><aside className="card historyPanel"><h3>最近换算</h3>{history.map(x=><button key={`${x[0]}-${x[1]}`} onClick={()=>{const parsed=Number.parseFloat(x[0]);if(Number.isFinite(parsed))setValue(parsed)}}><span>{x[0]}</span><b>{x[1]}</b></button>)}<button className="clearHistory" onClick={()=>setHistory([])}>清空记录</button></aside></div>
    <div className="referenceGrid"><section className="card referenceCard"><div><i className="orangebg">!</i><span><b>介质材质禁忌速查</b><small>高频腐蚀介质兼容性</small></span></div>{[["Cl₂ 氯气","禁用 EPDM","PCTFE / FFKM"],["HF 氢氟酸","禁用玻璃 / 金属","HP PFA / PTFE"],["O₃ 臭氧","禁用 NBR","316L EP / FFKM"]].slice(0,expanded?3:2).map(x=><p key={x[0]}><b>{x[0]}</b><span>{x[1]}</span><em>{x[2]}</em></p>)}<button onClick={()=>setExpanded(!expanded)}>{expanded?"收起禁忌表":"查看完整禁忌表"} →</button></section><section className="card referenceCard"><div><i className="bluebg">⌁</i><span><b>螺栓标准扭矩</b><small>304 不锈钢 · 干燥装配</small></span></div>{[["M4","2.4 N·m","± 0.2"],["M5","4.8 N·m","± 0.4"],["M6","8.3 N·m","± 0.7"]].map(x=><p key={x[0]}><b>{x[0]}</b><span>{x[1]}</span><em>{x[2]}</em></p>)}<button onClick={()=>void copyText("M4 2.4 N·m\nM5 4.8 N·m\nM6 8.3 N·m").then(()=>notify("扭矩标准已复制到剪贴板")).catch(error=>notify(error instanceof Error?error.message:"复制失败"))}>复制当前扭矩标准 →</button></section></div>
  </>;
}

function ArchivePage() {
  const [query,setQuery]=useState("");
  const [recentFirst,setRecentFirst]=useState(false);
  const projects=[
    ["FAB-2026-0715","Fab 2A 厂务系统深化设计","南京","进行中","电子特气","1,284","刚刚"],
    ["FAB-2026-0608","12英寸产线 Hook-up 改造","合肥","已校验","机台二次配","842","2 天前"],
    ["FAB-2026-0512","UPW 扩容与回水系统","无锡","已归档","超纯水","516","12 天前"],
  ];
  const shownProjects=(query?projects.filter(project=>project.join(" ").toLowerCase().includes(query.toLowerCase())):projects).slice();
  if(recentFirst) shownProjects.sort((a,b)=>a[6]==="刚刚"?-1:b[6]==="刚刚"?1:String(a[6]).localeCompare(String(b[6])));
  return <><PageTop eyebrow="PROJECT ARCHIVE" title="项目档案库" desc="集中管理项目版本、校验状态、BOM 与交付记录" actions={<button className="primaryButton" onClick={()=>openMasterData("projects")}>＋ 新建项目</button>}/><div className="archiveTools"><div className="searchBox">⌕<input placeholder="搜索项目编号、名称或厂区…" value={query} onChange={event=>setQuery(event.target.value)}/></div><button onClick={()=>{setQuery("");setRecentFirst(false)}}>全部状态</button><button className={recentFirst?"active":""} onClick={()=>setRecentFirst(!recentFirst)}>最近更新</button></div><div className="projectList">{shownProjects.map((p,i)=><article className="card projectRow" key={p[0]}><div className="projectIndex">0{i+1}</div><div className="projectMain"><small>{p[0]}</small><h3>{p[1]}</h3><p>{p[2]} · 洁净等级 ISO 4</p></div><span className={`chip ${systemClass[p[4]]}`}>{p[4]}</span><div className="projectMetric"><b>{p[5]}</b><span>物料总量</span></div><div className="projectStatus"><i className={i===0?"working":""}/><b>{p[3]}</b><span>更新于 {p[6]}</span></div><button onClick={()=>openMasterData("projects",String(p[0]))}>打开项目 →</button></article>)}</div></>;
}
