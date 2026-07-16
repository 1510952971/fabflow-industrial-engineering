"use client";

import { useMemo, useState } from "react";
import { createBomRecords } from "@/lib/bom-actions";
import { facilityDomains, facilitySystems, getFacilitySystem } from "@/lib/facility-systems";

type Notify = (message: string) => void;

const pipeCatalog = [
  { id: "VCR-4-EP", name: "VCR 面密封直通接头", systemId: "sys-sgas", connection: "VCR", material: "316L EP", pressure: 8.3, size: "1/4”", temp: 120, cleanliness: "UHP", pack: "10 件/盒", price: 186 },
  { id: "TUBE-8-BA", name: "BA 不锈钢管", systemId: "sys-bsgs", connection: "自动焊", material: "316L BA", pressure: 10, size: "1/2”", temp: 180, cleanliness: "HP", pack: "6 m/支", price: 92 },
  { id: "PFA-6-F", name: "PFA 扩口弯头", systemId: "sys-cds", connection: "Flare", material: "HP PFA", pressure: 1, size: "3/8”", temp: 95, cleanliness: "Chemical", pack: "5 件/袋", price: 128 },
  { id: "UPW-PVDF-20", name: "PVDF 红外焊三通", systemId: "sys-upw", connection: "IR Fusion", material: "HP PVDF", pressure: 1.6, size: "DN20", temp: 90, cleanliness: "UPW", pack: "1 件/袋", price: 460 },
  { id: "CDA-BV25", name: "CDA 不锈钢球阀", systemId: "sys-cda", connection: "双卡套", material: "304L", pressure: 2.5, size: "DN25", temp: 150, cleanliness: "Industrial", pack: "1 件/盒", price: 315 },
  { id: "FIRE-GR80", name: "消防沟槽刚性接头", systemId: "sys-fire", connection: "沟槽", material: "球墨铸铁", pressure: 2.5, size: "DN80", temp: 80, cleanliness: "Fire", pack: "1 件/箱", price: 238 },
  { id: "EXH-PP900", name: "酸性排风 PP 法兰", systemId: "sys-exh", connection: "法兰", material: "PP-H", pressure: .05, size: "DN900", temp: 80, cleanliness: "Industrial", pack: "1 件/箱", price: 1280 },
];

export function PipeSelectionPage({ notify }: { notify: Notify }) {
  const [systemId, setSystemId] = useState("all");
  const [material, setMaterial] = useState("全部材质");
  const [connection, setConnection] = useState("全部连接");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const shown = useMemo(() => pipeCatalog.filter((item) => {
    const system = getFacilitySystem(item.systemId);
    return (systemId === "all" || item.systemId === systemId)
      && (material === "全部材质" || item.material.includes(material))
      && (connection === "全部连接" || item.connection === connection)
      && (item.name.toLowerCase().includes(query.toLowerCase()) || item.id.toLowerCase().includes(query.toLowerCase()) || (system?.name || "").includes(query));
  }), [systemId, material, connection, query]);

  const addSelected = async () => {
    if (!selected.length) { notify("请先选择至少一项管路材料"); return; }
    try {
      const targets = pipeCatalog.filter((item) => selected.includes(item.id));
      await createBomRecords(targets.map((item) => {
        const system = getFacilitySystem(item.systemId);
        return {
          systemId: system?.dbSystemId,
          itemCode: item.id,
          itemName: item.name,
          specification: item.size + " · " + item.material + " · " + item.connection,
          quantity: 1,
          unit: item.id.startsWith("TUBE") ? "米" : "件",
          unitPriceCny: item.price,
          sourceType: "catalog",
          sourceId: item.systemId + ":" + item.id,
        };
      }));
      setSelected([]);
      notify("已将 " + targets.length + " 项管路材料写入 D1 项目 BOM");
    } catch (error) {
      notify(error instanceof Error ? error.message : "管路材料写入失败");
    }
  };

  return <>
    <div className="moduleTop"><div><span>PIPING & FITTINGS SELECTION</span><h2>管路接头选型</h2><p>按工程系统、介质洁净等级、连接方式、材质、压力与温度独立筛选管材、接头和阀件</p></div><div className="moduleActions"><button className="softButton" onClick={() => { setSystemId("all"); setMaterial("全部材质"); setConnection("全部连接"); setQuery(""); }}>重置条件</button><button className="primaryButton" disabled={!selected.length} onClick={() => void addSelected()}>写入 BOM · {selected.length}</button></div></div>
    <section className="card selectionContext"><div><span>统一系统目录</span><b>{facilitySystems.length} 个可选工程系统</b><small>与介质工况、系统工程域和 BOM 使用同一编码</small></div><div><span>选型边界</span><b>管材 / 接头 / 阀件</b><small>大型机组和成套设备请进入“厂务大型设备库”</small></div><div><span>当前结果</span><b>{shown.length} 项</b><small>按系统与工况实时过滤</small></div></section>
    <section className="card filterPanel pipeFilterPanel">
      <div className="searchBox">⌕<input placeholder="搜索管材、接头、规格、编码或系统…" value={query} onChange={(event) => setQuery(event.target.value)}/><kbd>{shown.length} 项</kbd></div>
      <div className="selectionFilters"><label><span>工程系统</span><select value={systemId} onChange={(event) => setSystemId(event.target.value)}><option value="all">全部工程系统</option>{facilityDomains.map((domain) => <optgroup label={domain.id + " · " + domain.name} key={domain.id}>{facilitySystems.filter((item) => item.domainId === domain.id).map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</optgroup>)}</select></label><label><span>材质</span><select value={material} onChange={(event) => setMaterial(event.target.value)}>{["全部材质","316L","PFA","PVDF","304L","PP-H","球墨铸铁"].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>连接方式</span><select value={connection} onChange={(event) => setConnection(event.target.value)}>{["全部连接","VCR","自动焊","Flare","IR Fusion","双卡套","沟槽","法兰"].map((item) => <option key={item}>{item}</option>)}</select></label></div>
    </section>
    <div className="catalogHeader"><p>找到 <b>{shown.length}</b> 项管路材料 <span>· 不与成套设备混用</span></p></div>
    <div className="catalogGrid">{shown.map((item, index) => {
      const system = getFacilitySystem(item.systemId)!;
      return <article className="card catalogCard pipeCatalogCard" key={item.id}><div className="catalogVisual"><div className="pipeShape"><i/><i/><i/></div><span>工况匹配 {97 - index * 3}%</span></div><div className="catalogBody"><div className="catalogTitle"><div><small>{item.id}</small><h3>{item.name}</h3></div><span className={"chip " + system.color}>{system.name}</span></div><div className="catalogSpecs"><div><span>材质</span><b>{item.material}</b></div><div><span>连接</span><b>{item.connection}</b></div><div><span>规格</span><b>{item.size}</b></div><div><span>洁净等级</span><b>{item.cleanliness}</b></div></div><div className="pressureMeter"><span>设计耐压</span><div><i style={{ width: Math.min(100, item.pressure * 10) + "%" }}/></div><b>{item.pressure} MPa / {item.temp}°C</b></div><div className="catalogFoot"><span><small>参考单价</small><b>¥ {item.price.toLocaleString()}</b> / {item.pack}</span><button className={selected.includes(item.id) ? "addedButton" : ""} onClick={() => setSelected(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])}>{selected.includes(item.id) ? "✓ 已选择" : "＋ 选择"}</button></div></div></article>;
    })}</div>
  </>;
}
