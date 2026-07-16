"use client";

import { useMemo, useState } from "react";
import { ModuleRouter } from "./modules";

const nav = [
  ["⌂", "项目工作台"], ["◇", "介质参数录入"], ["⌁", "结构紧固件计算"],
  ["⑂", "管路接头选型"], ["▣", "厂务大型设备库"], ["⊞", "机台二次配批量算量"],
  ["✓", "合规校验中心"], ["▤", "BOM 成本报表"], ["◎", "全球建设管理"], ["⚙", "工程执行中心"], ["◫", "系统工程域"], ["◌", "数据底座与协同"], ["◷", "计划与供应链"], ["⇄", "全局工具箱"], ["□", "项目档案库"],
];

const materials = [
  {name:"VCR 面密封接头", spec:'1/4” · 316L EP', system:"电子特气", color:"blue", pressure:72, price:186},
  {name:"BA 不锈钢管", spec:'1/2” × 1.24 mm', system:"大宗气体", color:"green", pressure:84, price:92},
  {name:"PFA 扩口接头", spec:'3/8” · HP PFA', system:"湿化学品", color:"purple", pressure:42, price:128},
];

export default function Home() {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [pressure, setPressure] = useState(0.68);
  const [thickness, setThickness] = useState(2);
  const [points, setPoints] = useState(128);
  const [quantity, setQuantity] = useState(8);
  const [active, setActive] = useState("项目工作台");
  const [added, setAdded] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const bolt = thickness <= 2 ? "M5 × 8" : thickness <= 4 ? "M5 × 12" : "M6 × 16";
  const total = useMemo(() => points * 4, [points]);
  const notify = (message:string) => { setToast(message); window.setTimeout(()=>setToast(""), 1800); };

  return <main className={dark ? "app dark" : "app"}>
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
      <div className="brand"><div className="brandmark"><i/><i/><i/></div><div><b>FabFlow</b><span>厂务流体智能选型</span></div></div>
      <button className="collapse" onClick={()=>setCollapsed(!collapsed)} aria-label="折叠菜单">{collapsed ? "›" : "‹"}</button>
      <nav>{nav.map(([icon,label])=><button key={label} className={active===label?"active":""} onClick={()=>setActive(label)} title={label}><em>{icon}</em><span>{label}</span>{label==="合规校验中心"&&<small>3</small>}</button>)}</nav>
      <div className="sidebarBottom">
        <button className="themeSwitch" onClick={()=>setDark(!dark)}><em>{dark?"☾":"☼"}</em><span>{dark?"暗黑工程版":"浅色办公版"}</span><i className={dark?"on":""}/></button>
        <div className="profile"><div>TC</div><span><b>唐工程师</b><small>工艺设计部</small></span><button>···</button></div>
      </div>
    </aside>

    <section className="workspace">
      <header>
        <div><p>项目工作台 <span>/ FAB-2026-0715</span></p><h1>先进制程厂务扩建项目</h1></div>
        <div className="headerActions"><button className="iconBtn" onClick={()=>setDrawer(true)}>⇄</button><button className="iconBtn">⌕</button><button className="primary" onClick={()=>notify("项目数据已保存")}>保存项目 <span>⌘ S</span></button></div>
      </header>

      <div className="content">
        {active === "项目工作台" ? <>
        <section className="projectHero card">
          <div className="heroCopy"><div className="eyebrow"><i/> DESIGN IN PROGRESS</div><h2>Fab 2A 厂务系统深化设计</h2><p>南京 · 洁净等级 ISO 4 · 最后更新于 10 分钟前</p><div className="chips"><span className="chip blue">电子特气 VMB</span><span className="chip green">大宗 BSGS</span><span className="chip purple">湿化学品 CDS</span><span className="chip cyan">超纯水 UPW</span><button>＋ 添加系统</button></div></div>
          <div className="heroMetric"><span>设计完成度</span><b>68<small>%</small></b><div><i style={{width:"68%"}}/></div><p>12 个模块中已完成 8 个</p></div>
        </section>

        <div className="sectionTitle"><div><h2>今日工作面板</h2><p>核心参数实时联动 · 卡片可按习惯自由排布</p></div><button>＋ 添加模块</button></div>

        <div className="dashboardGrid">
          <section className="card parameters">
            <div className="cardHead"><div className="cardIcon bluebg">◇</div><div><h3>工况参数</h3><p>电子特气 · VMB 柜体装配</p></div><button>•••</button></div>
            <div className="fields">
              <label><span>设计压力 <b>MPa</b></span><input type="number" step="0.01" value={pressure} onChange={e=>setPressure(+e.target.value)}/><small>范围 0.1 — 1.0 MPa</small></label>
              <label><span>工作温度 <b>°C</b></span><input type="number" defaultValue={23}/><small>常温工况</small></label>
              <label><span>面板厚度 <b>mm</b></span><input type="number" step="0.5" value={thickness} onChange={e=>setThickness(+e.target.value)}/><small>304 不锈钢拉丝板</small></label>
              <label><span>安装点位 <b>个</b></span><input type="number" value={points} onChange={e=>setPoints(+e.target.value)}/><small>自动计算采购余量</small></label>
            </div>
            <div className="riskbar"><span>介质风险</span><div><i/><i/><i/></div><b>中等 · 腐蚀性</b></div>
          </section>

          <section className="card result">
            <div className="cardHead"><div className="cardIcon greenbg">⌁</div><div><h3>智能计算结果</h3><p><i className="live"/> 参数已实时同步</p></div><span className="verified">✓ 已校核</span></div>
            <div className="boltResult"><div><span>推荐螺栓规格</span><strong>{bolt}</strong><p>304 · 十字槽盘头 · 四组合</p></div><div className="boltVisual"><i/><i/><i/><i/><i/><i/></div></div>
            <div className="resultStats"><div><span>建议扭矩</span><b>{bolt.startsWith("M6")?"6.2":"4.8"} <small>N·m</small></b></div><div><span>采购数量</span><b>{Math.ceil(total*1.05)} <small>套</small></b></div><div><span>安全余量</span><b>5 <small>%</small></b></div></div>
            <button className="outline" onClick={()=>notify("紧固件已加入 BOM")}>加入项目 BOM <span>→</span></button>
          </section>

          <section className="card selector">
            <div className="cardHead"><div className="cardIcon purplebg">⑂</div><div><h3>管路与设备选型</h3><p>基于当前工况智能匹配</p></div><button>查看全部 →</button></div>
            <div className="filterChips"><button className="selected">全部 24</button><button>316L</button><button>VCR 接头</button><button>≤ 1.0 MPa</button></div>
            <div className="materialList">{materials.map(m=><div className="material" key={m.name}><div className={`materialIcon ${m.color}`}>⌁</div><div className="materialInfo"><div><b>{m.name}</b><span className={`chip ${m.color}`}>{m.system}</span></div><p>{m.spec} · 耐压 {m.pressure/10} MPa</p><div className="mini"><i style={{width:m.pressure+"%"}}/></div></div><div className="price"><b>¥{m.price}</b><button className={added.includes(m.name)?"done":""} onClick={()=>{setAdded(x=>x.includes(m.name)?x:[...x,m.name]);notify(`${m.name} 已加入 BOM`)}}>{added.includes(m.name)?"✓":"＋"}</button></div></div>)}</div>
          </section>

          <section className="card compliance">
            <div className="cardHead"><div className="cardIcon orangebg">✓</div><div><h3>合规校验</h3><p>规则库 · SEMI / 国标 / 企业标准</p></div><span className="warningTag">3 项需关注</span></div>
            <div className="score"><div className="ring"><span>92<small>分</small></span></div><div><b>整体状态良好</b><p>已检查 36 项设计规则</p><div><span>✓ 31 合格</span><span>! 3 警告</span><span>× 2 待确认</span></div></div></div>
            <div className="alerts"><button><i className="amber"/><span><b>薄板装配需增加防松措施</b><small>紧固件 · 建议使用带齿垫圈</small></span><em>›</em></button><button><i className="red"/><span><b>材料禁忌：Cl₂ 不兼容 EPDM</b><small>VMB-02 · 建议更换 PCTFE</small></span><em>›</em></button></div>
          </section>

          <section className="card machine">
            <div className="cardHead"><div className="cardIcon cyanbg">⊞</div><div><h3>机台批量算量</h3><p>ETCH-AX300 · 二次配工程量</p></div><div className="stepper"><button onClick={()=>setQuantity(Math.max(1,quantity-1))}>−</button><b>{quantity} 台</b><button onClick={()=>setQuantity(quantity+1)}>＋</button></div></div>
            <div className="machineBody"><div className="donut"><span><b>{quantity*42}</b><small>物料项</small></span></div><div className="legend"><p><i className="blue"/>气路 <b>{quantity*18}</b></p><p><i className="cyan"/>纯水 <b>{quantity*9}</b></p><p><i className="purple"/>化学品 <b>{quantity*8}</b></p><p><i className="gray"/>真空 <b>{quantity*7}</b></p></div></div>
          </section>

          <section className="card bom">
            <div className="cardHead"><div className="cardIcon bluebg">▤</div><div><h3>项目 BOM 概览</h3><p>实时汇总 · 含 5% 采购余量</p></div><button>打开报表 →</button></div>
            <div className="bomValue"><span>预估材料成本</span><b>¥ 286,420.00</b><small>较预算低 8.4% ↘</small></div><div className="costbar"><i/><i/><i/><i/></div><div className="costlegend"><span>管路 42%</span><span>阀件 28%</span><span>紧固件 18%</span><span>其他 12%</span></div>
          </section>
        </div>
        </> : <ModuleRouter active={active} notify={notify}/>} 
      </div>
    </section>

    <button className="drawerTab" onClick={()=>setDrawer(true)}>工具箱 <span>⇄</span></button>
    {drawer&&<><div className="overlay" onClick={()=>setDrawer(false)}/><aside className="drawer"><div className="drawerHead"><div><span>QUICK TOOLS</span><h2>工程辅助工具箱</h2></div><button onClick={()=>setDrawer(false)}>×</button></div><div className="toolTabs"><button className="active">单位换算</button><button>材质禁忌</button><button>扭矩速查</button></div><div className="converter card"><label>压力 · MPa<input value={pressure} onChange={e=>setPressure(+e.target.value)}/></label><button>⇅</button><label>压力 · psi<input readOnly value={(pressure*145.038).toFixed(2)}/></label><p>常用值 <button onClick={()=>setPressure(6.895)}>1000 psi</button><button onClick={()=>setPressure(0.7)}>0.7 MPa</button></p></div><div className="toolCard"><span>CURRENT BOM</span><h3>当前项目物料</h3><div><b>{1284+added.length}</b><small>总物料数量</small></div><button onClick={()=>notify("CAD 标注文本已复制")}>复制 CAD 标注文本</button></div></aside></>}
    {toast&&<div className="toast">✓ {toast}</div>}
  </main>;
}
