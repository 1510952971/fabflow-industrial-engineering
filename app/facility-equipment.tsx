"use client";

import { useMemo, useState } from "react";
import { createBomRecords } from "@/lib/bom-actions";
import { openMasterData } from "@/lib/client-actions";
import { facilityDomains, facilitySystems, getFacilitySystem } from "@/lib/facility-systems";

type Notify = (message: string) => void;

const equipmentCatalog = [
  { id: "VMB-4L-AUTO", name: "四路全自动 VMB", systemId: "sys-sgas", category: "特气设备", capacity: "4 Line / 1+1", duty: "SiH4 / H2", redundancy: "双路切换", power: "230V · 1.2 kW", vendor: "FabFlow Approved", leadWeeks: 20, interfaceState: "已校核", price: 168000 },
  { id: "CDS-200-DUAL", name: "双桶化学品供应单元", systemId: "sys-cds", category: "化学品设备", capacity: "2 × 200 L", duty: "HF / HCl", redundancy: "Duty / Standby", power: "400V · 4.5 kW", vendor: "Chem Process", leadWeeks: 24, interfaceState: "待设备厂确认", price: 236000 },
  { id: "UPW-POLISH-40", name: "UPW 抛光混床 Skid", systemId: "sys-upw", category: "水处理设备", capacity: "40 m³/h", duty: "18.2 MΩ·cm", redundancy: "N+1 Pump", power: "400V · 18 kW", vendor: "Pure Water Systems", leadWeeks: 28, interfaceState: "已校核", price: 420000 },
  { id: "CDA-COMP-120", name: "无油离心空压机组", systemId: "sys-cda", category: "动力设备", capacity: "120 Nm³/min", duty: "CDA -40°C PDP", redundancy: "3 × 50%", power: "10kV · 850 kW", vendor: "Industrial Air", leadWeeks: 36, interfaceState: "接口有条件", price: 3860000 },
  { id: "CHW-CHILLER-2800", name: "高效离心冷水机组", systemId: "sys-chw", category: "动力设备", capacity: "2,800 RT", duty: "5/12°C CHW", redundancy: "N+1", power: "10kV · 1.9 MW", vendor: "Thermal Systems", leadWeeks: 42, interfaceState: "接口有条件", price: 12800000 },
  { id: "CR-MAU-180K", name: "洁净新风处理机组 MAU", systemId: "sys-cr", category: "洁净设备", capacity: "180,000 CMH", duty: "ISO 4 Make-up Air", redundancy: "2 × 50%", power: "400V · 220 kW", vendor: "Cleanroom Technologies", leadWeeks: 32, interfaceState: "待设备厂确认", price: 5680000 },
  { id: "EXH-SCRUB-120K", name: "酸性排风洗涤塔", systemId: "sys-exh", category: "环保设备", capacity: "120,000 CMH", duty: "HF / HCl Exhaust", redundancy: "2 × 60%", power: "400V · 160 kW", vendor: "Environmental Systems", leadWeeks: 30, interfaceState: "已校核", price: 2960000 },
  { id: "FIRE-PUMP-250", name: "柴油消防泵组", systemId: "sys-fire", category: "消防设备", capacity: "250 L/s @ 1.4 MPa", duty: "Fire Water", redundancy: "Electric + Diesel", power: "400V / Diesel", vendor: "Fire Safety Systems", leadWeeks: 26, interfaceState: "已校核", price: 980000 },
];

export function FacilityEquipmentPage({ notify }: { notify: Notify }) {
  const [systemId, setSystemId] = useState("all");
  const [category, setCategory] = useState("全部设备");
  const [interfaceState, setInterfaceState] = useState("全部状态");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const shown = useMemo(() => equipmentCatalog.filter((item) => {
    const system = getFacilitySystem(item.systemId);
    return (systemId === "all" || item.systemId === systemId)
      && (category === "全部设备" || item.category === category)
      && (interfaceState === "全部状态" || item.interfaceState === interfaceState)
      && (item.name.toLowerCase().includes(query.toLowerCase()) || item.id.toLowerCase().includes(query.toLowerCase()) || item.vendor.toLowerCase().includes(query.toLowerCase()) || (system?.name || "").includes(query));
  }), [systemId, category, interfaceState, query]);

  const addSelected = async () => {
    if (!selected.length) { notify("请先选择至少一台厂务设备"); return; }
    try {
      const targets = equipmentCatalog.filter((item) => selected.includes(item.id));
      await createBomRecords(targets.map((item) => {
        const system = getFacilitySystem(item.systemId);
        return {
          systemId: system?.dbSystemId,
          itemCode: item.id,
          itemName: item.name,
          specification: item.capacity + " · " + item.duty + " · " + item.redundancy,
          quantity: 1,
          unit: "台",
          unitPriceCny: item.price,
          sourceType: "equipment",
          sourceId: item.systemId + ":" + item.id,
        };
      }));
      setSelected([]);
      notify("已将 " + targets.length + " 台厂务设备写入 D1 项目 BOM");
    } catch (error) {
      notify(error instanceof Error ? error.message : "厂务设备写入失败");
    }
  };

  return <>
    <div className="moduleTop"><div><span>FACILITY EQUIPMENT LIBRARY</span><h2>厂务大型设备库</h2><p>独立管理成套机组的容量、冗余、电力、设备厂资料、接口成熟度、交期与预算，不再与管件卡片混用</p></div><div className="moduleActions"><button className="softButton" onClick={() => openMasterData("equipmentModels")}>设备厂型号库</button><button className="primaryButton" disabled={!selected.length} onClick={() => void addSelected()}>加入设备 BOM · {selected.length}</button></div></div>
    <section className="card equipmentSummary"><div><span>设备型号</span><b>{equipmentCatalog.length}</b><small>覆盖工艺、动力、洁净、水、排风和消防</small></div><div><span>接口已校核</span><b>{equipmentCatalog.filter((item) => item.interfaceState === "已校核").length}</b><small>其余需冻结 Vendor Data</small></div><div><span>最长设备交期</span><b>{Math.max(...equipmentCatalog.map((item) => item.leadWeeks))}<em>周</em></b><small>长周期设备需纳入采购关键路径</small></div><div><span>当前选择预算</span><b>¥ {equipmentCatalog.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.price, 0).toLocaleString()}</b><small>未含税费、运输与安装</small></div></section>
    <section className="card filterPanel equipmentFilterPanel">
      <div className="searchBox">⌕<input placeholder="搜索设备、型号、设备厂或系统…" value={query} onChange={(event) => setQuery(event.target.value)}/><kbd>{shown.length} 台</kbd></div>
      <div className="selectionFilters"><label><span>所属工程系统</span><select value={systemId} onChange={(event) => setSystemId(event.target.value)}><option value="all">全部工程系统</option>{facilityDomains.map((domain) => <optgroup label={domain.id + " · " + domain.name} key={domain.id}>{facilitySystems.filter((item) => item.domainId === domain.id).map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</optgroup>)}</select></label><label><span>设备类别</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{["全部设备",...Array.from(new Set(equipmentCatalog.map((item) => item.category)))].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>接口成熟度</span><select value={interfaceState} onChange={(event) => setInterfaceState(event.target.value)}>{["全部状态","已校核","接口有条件","待设备厂确认"].map((item) => <option key={item}>{item}</option>)}</select></label></div>
    </section>
    <div className="equipmentLibraryGrid">{shown.map((item) => {
      const system = getFacilitySystem(item.systemId)!;
      const selectedItem = selected.includes(item.id);
      return <article className={"card equipmentLibraryCard " + (selectedItem ? "selected" : "")} key={item.id}><header><div className={"equipmentGlyph " + system.color}>▣</div><div><small>{item.id} · {item.category}</small><h3>{item.name}</h3><span className={"chip " + system.color}>{system.name}</span></div><button onClick={() => setSelected(selectedItem ? selected.filter((id) => id !== item.id) : [...selected, item.id])}>{selectedItem ? "✓ 已选择" : "＋ 选择"}</button></header><div className="equipmentDuty"><span>设计工况</span><b>{item.capacity}</b><small>{item.duty}</small></div><div className="equipmentSpecs"><p><span>冗余策略</span><b>{item.redundancy}</b></p><p><span>电力接口</span><b>{item.power}</b></p><p><span>候选设备厂</span><b>{item.vendor}</b></p><p><span>预计交期</span><b className={item.leadWeeks >= 36 ? "redText" : "blueText"}>{item.leadWeeks} 周</b></p></div><footer><span className={"equipmentInterface " + (item.interfaceState === "已校核" ? "passed" : item.interfaceState === "接口有条件" ? "attention" : "pending")}>{item.interfaceState}</span><div><small>参考设备价</small><b>¥ {item.price.toLocaleString()}</b></div><button onClick={() => { openMasterData("equipmentModels", item.id); notify(item.name + " 设备接口与内部材料已打开"); }}>接口与内部材料 →</button></footer></article>;
    })}</div>
  </>;
}
