"use client";

import { useEffect, useMemo, useState } from "react";
import { createBomRecords } from "@/lib/bom-actions";
import { openMasterData } from "@/lib/client-actions";
import { facilityDomains, facilitySystems, getFacilitySystem } from "@/lib/facility-systems";
import { getCurrentProjectId } from "@/lib/project-context";
import { loadProjectSystems, resolveProjectSystem } from "@/lib/project-systems-client";
import { evaluatePipeSelection, type PipeCatalogItem, type PipeMatchResult, type PipeSelectionBasis } from "@/lib/pipe-selection-engine";

type Notify = (message: string) => void;
type TagRecord = { id: string; systemId: string; tagNo: string; medium?: string | null; designPressureMpa?: number | null; designTemperatureC?: number | null };
type InterfaceRecord = { id: string; fromTagId?: string | null; toTagId?: string | null; interfaceCode: string; medium: string; connectionStandard: string; nominalSize: string; designPressureMpa: number; designTemperatureC: number; cleanlinessGrade: string };
type MaterialRecord = { id: string; manufacturer: string; code: string; name: string; grade: string; baseMaterial: string; surfaceFinish: string; cleanlinessGrade: string; maxPressureMpa: number; maxTemperatureC: number; status: string };

const pipeCatalog: PipeCatalogItem[] = [
  { id: "VCR-4-EP", name: "VCR 面密封直通接头", systemId: "sys-sgas", connection: "VCR", material: "316L EP", pressure: 8.3, size: "1/4”", temp: 120, cleanliness: "UHP", pack: "10 件/盒", price: 186 },
  { id: "TUBE-8-BA", name: "BA 不锈钢管", systemId: "sys-bsgs", connection: "自动焊", material: "316L BA", pressure: 10, size: "1/2”", temp: 180, cleanliness: "HP", pack: "6 m/支", price: 92 },
  { id: "PFA-6-F", name: "PFA 扩口弯头", systemId: "sys-cds", connection: "Flare", material: "HP PFA", pressure: 1, size: "3/8”", temp: 95, cleanliness: "Chemical", pack: "5 件/袋", price: 128 },
  { id: "UPW-PVDF-20", name: "PVDF 红外焊三通", systemId: "sys-upw", connection: "IR Fusion", material: "HP PVDF", pressure: 1.6, size: "DN20", temp: 90, cleanliness: "UPW", pack: "1 件/袋", price: 460 },
  { id: "CDA-BV25", name: "CDA 不锈钢球阀", systemId: "sys-cda", connection: "双卡套", material: "304L", pressure: 2.5, size: "DN25", temp: 150, cleanliness: "Industrial", pack: "1 件/盒", price: 315 },
  { id: "HUP-VCR-4", name: "机台二次配 VCR 接头", systemId: "sys-hookup", connection: "VCR", material: "316L EP", pressure: 8.3, size: "1/4”", temp: 120, cleanliness: "UHP", pack: "10 件/盒", price: 196 },
  { id: "PCW-TUBE-40", name: "PCW 316L 自动焊管件", systemId: "sys-pcw", connection: "自动焊", material: "316L BA", pressure: 2.5, size: "DN40", temp: 150, cleanliness: "Industrial", pack: "1 件/袋", price: 286 },
  { id: "CHW-GR100", name: "冷冻水沟槽接头", systemId: "sys-chw", connection: "沟槽", material: "碳钢环氧涂层", pressure: 2.5, size: "DN100", temp: 80, cleanliness: "Industrial", pack: "1 件/箱", price: 268 },
  { id: "CR-DRAIN-25", name: "洁净室冷凝水双卡套接头", systemId: "sys-cr", connection: "双卡套", material: "304L BA", pressure: 1.6, size: "DN25", temp: 120, cleanliness: "Clean", pack: "1 件/袋", price: 215 },
  { id: "WWT-PVDF-50", name: "废水 PVDF 法兰接头", systemId: "sys-wwt", connection: "法兰", material: "HP PVDF", pressure: 1.6, size: "DN50", temp: 90, cleanliness: "Industrial", pack: "1 件/箱", price: 588 },
  { id: "CTRL-TUBE-4", name: "仪表气双卡套接头", systemId: "sys-ctrl", connection: "双卡套", material: "316L BA", pressure: 4, size: "1/4”", temp: 150, cleanliness: "HP", pack: "10 件/盒", price: 96 },  { id: "FIRE-GR80", name: "消防沟槽刚性接头", systemId: "sys-fire", connection: "沟槽", material: "球墨铸铁", pressure: 2.5, size: "DN80", temp: 80, cleanliness: "Fire", pack: "1 件/箱", price: 238 },
  { id: "EXH-PP900", name: "酸性排风 PP 法兰", systemId: "sys-exh", connection: "法兰", material: "PP-H", pressure: .05, size: "DN900", temp: 80, cleanliness: "Industrial", pack: "1 件/箱", price: 1280 },
];

function readTransferredBasis() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem("fabflow:pipe-selection-basis");
    return raw ? JSON.parse(raw) as PipeSelectionBasis : null;
  } catch { return null; }
}

export function PipeSelectionPage({ notify }: { notify: Notify }) {
  const [systemId, setSystemId] = useState("all");
  const [material, setMaterial] = useState("全部材质");
  const [connection, setConnection] = useState("全部连接");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bases, setBases] = useState<PipeSelectionBasis[]>(() => { const basis = readTransferredBasis(); return basis ? [basis] : []; });
  const [basisId, setBasisId] = useState(() => readTransferredBasis()?.sourceId ?? "");
  const [showBlocked, setShowBlocked] = useState(false);
  const [loadingBasis, setLoadingBasis] = useState(true);
  const [materialRecords, setMaterialRecords] = useState<MaterialRecord[]>([]);
  const [basisError, setBasisError] = useState("");
  const activeBasis = bases.find((item) => item.sourceId === basisId) ?? null;

  useEffect(() => {
    const projectId = getCurrentProjectId();
    Promise.all([
      fetch(`/api/master-data?entities=tags,interfaces,materials&projectId=${encodeURIComponent(projectId)}&pageSize=500`, { cache: "no-store" }).then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "设计输入加载失败"); return payload.data as { tags: TagRecord[]; interfaces: InterfaceRecord[]; materials: MaterialRecord[] }; }),
      loadProjectSystems(projectId),
    ]).then(([data, projectSystems]) => {
      const transferred = readTransferredBasis();
      const tagById = new Map(data.tags.map((tag) => [tag.id, tag]));
      const systemById = new Map(projectSystems.map((system) => [system.id, system]));
      const saved = data.interfaces.map((item) => {
        const tag = item.fromTagId ? tagById.get(item.fromTagId) : item.toTagId ? tagById.get(item.toTagId) : undefined;
        const projectSystem = tag ? systemById.get(tag.systemId) : undefined;
        const catalogSystem = projectSystem ? getFacilitySystem(projectSystem.code) : undefined;
        if (!catalogSystem) return null;
        return {
          sourceType: "interface",
          sourceId: item.id,
          sourceLabel: `${item.interfaceCode} · ${tag?.tagNo || "未关联 Tag"} · ${item.medium}`,
          systemId: catalogSystem.id,
          medium: item.medium,
          designPressureMpa: item.designPressureMpa,
          designTemperatureC: item.designTemperatureC,
          connectionStandard: item.connectionStandard,
          nominalSize: item.nominalSize,
          cleanlinessGrade: item.cleanlinessGrade,
        } as PipeSelectionBasis;
      }).filter(Boolean) as PipeSelectionBasis[];
      const merged = transferred ? [transferred, ...saved.filter((item) => item.sourceId !== transferred.sourceId)] : saved;
      setBases(merged);
      setMaterialRecords((data.materials ?? []).filter((item) => item.status !== "archived"));
      setBasisError("");
      const nextId = transferred?.sourceId || merged[0]?.sourceId || "";
      setBasisId(nextId);
      const nextBasis = merged.find((item) => item.sourceId === nextId);
      if (nextBasis) setSystemId(nextBasis.systemId);
    }).catch((error) => setBasisError(error instanceof Error ? error.message : "设计输入加载失败")).finally(() => setLoadingBasis(false));
  }, []);

  const catalog = useMemo<PipeCatalogItem[]>(() => [
    ...pipeCatalog.map((item) => ({ ...item, source: "standard" as const })),
    ...(activeBasis ? materialRecords.map((item) => ({
      id: `material:${item.id}`,
      catalogCode: item.code,
      materialId: item.id,
      name: `${item.manufacturer} · ${item.name}`,
      systemId: activeBasis.systemId,
      connection: activeBasis.connectionStandard,
      material: `${item.grade} ${item.surfaceFinish}`.trim(),
      pressure: item.maxPressureMpa,
      size: activeBasis.nominalSize,
      temp: item.maxTemperatureC,
      cleanliness: item.cleanlinessGrade,
      pack: "材料主数据 · 待询价",
      price: 0,
      source: "material_master" as const,
    })) : []),
  ], [activeBasis, materialRecords]);
  const matches = useMemo(() => new Map(catalog.map((item) => [item.id, activeBasis ? evaluatePipeSelection(item, activeBasis) : null])), [activeBasis, catalog]);
  const shown = useMemo(() => catalog.filter((item) => {
    const system = getFacilitySystem(item.systemId);
    const result = matches.get(item.id);
    return (systemId === "all" || item.systemId === systemId)
      && (material === "全部材质" || item.material.includes(material))
      && (connection === "全部连接" || item.connection === connection)
      && (showBlocked || !activeBasis || result?.status !== "blocked")
      && (item.name.toLowerCase().includes(query.toLowerCase()) || item.id.toLowerCase().includes(query.toLowerCase()) || (system?.name || "").includes(query));
  }), [systemId, material, connection, query, showBlocked, activeBasis, matches, catalog]);

  const selectBasis = (sourceId: string) => {
    setBasisId(sourceId);
    setSelected([]);
    const next = bases.find((item) => item.sourceId === sourceId);
    if (next) setSystemId(next.systemId);
  };

  const addSelected = async () => {
    if (!activeBasis) { notify("请先选择 Tag / 接口设计输入，未校验物料不能写入 BOM"); return; }
    if (!selected.length) { notify("请先选择至少一项管路材料"); return; }
    const targets = catalog.filter((item) => selected.includes(item.id));
    const blocked = targets.filter((item) => matches.get(item.id)?.status === "blocked");
    if (blocked.length) { notify(blocked.map((item) => item.id).join("、") + " 存在阻断项，不能写入 BOM"); return; }
    try {
      const projectSystemByCatalog = new Map<string, string>();
      for (const item of targets) {
        const catalogSystem = getFacilitySystem(item.systemId)!;
        const projectSystem = await resolveProjectSystem(catalogSystem, true);
        if (!projectSystem) throw new Error(catalogSystem.name + " 尚未建立项目系统记录");
        projectSystemByCatalog.set(item.systemId, projectSystem.id);
      }
      await createBomRecords(targets.map((item) => ({
        systemId: projectSystemByCatalog.get(item.systemId),
        materialId: item.materialId,
        itemCode: item.catalogCode ?? item.id,
        itemName: item.name,
        specification: `${item.size} · ${item.material} · ${item.connection} · 校验 ${matches.get(item.id)?.score ?? 0} 分`,
        quantity: 1,
        unit: item.id.startsWith("TUBE") ? "米" : "件",
        unitPriceCny: item.price,
        sourceType: item.source === "material_master" ? "material_master_selection" : `pipe_${activeBasis.sourceType}`,
        sourceId: activeBasis.sourceId,
        status: "validated",
      })));
      setSelected([]);
      notify("已将 " + targets.length + " 项已校验管路材料写入项目 BOM");
    } catch (error) {
      notify(error instanceof Error ? error.message : "管路材料写入失败");
    }
  };

  return <>
    <div className="moduleTop"><div><span>PIPING & FITTINGS SELECTION</span><h2>管路接头选型</h2><p>以 Tag / 接口工况为唯一输入，逐项校核系统、介质、压力、温度、连接、尺寸和洁净等级</p></div><div className="moduleActions"><button className="softButton" onClick={() => openMasterData("materials")}>维护材料主数据</button><button className="softButton" onClick={() => { setSystemId(activeBasis?.systemId || "all"); setMaterial("全部材质"); setConnection("全部连接"); setQuery(""); setShowBlocked(false); }}>重置条件</button><button className="primaryButton" disabled={!activeBasis || !selected.length} onClick={() => void addSelected()}>写入 BOM · {selected.length}</button></div></div>
    <section className="card selectionContext"><div><span>当前设计输入</span><b>{activeBasis?.sourceLabel || (loadingBasis ? "正在读取…" : "尚未选择")}</b><small>{activeBasis ? `${activeBasis.designPressureMpa} MPa / ${activeBasis.designTemperatureC}°C / ${activeBasis.connectionStandard} ${activeBasis.nominalSize}` : "请先从介质参数页保存，或选择已有接口"}</small>{basisError && <small className="redText">{basisError}</small>}</div><div><span>选型规则</span><b>7 项联合校验</b><small>任一阻断项都不能写入 BOM</small></div><div><span>当前结果</span><b>{shown.length} 项</b><small>{showBlocked ? "含不符合项" : "仅显示可用候选"}</small></div></section>
    <section className="card filterPanel pipeFilterPanel">
      <div className="searchBox">⌕<input placeholder="搜索管材、接头、规格、编码或系统…" value={query} onChange={(event) => setQuery(event.target.value)}/><kbd>{shown.length} 项</kbd></div>
      <div className="selectionFilters"><label><span>Tag / 接口设计输入</span><select value={basisId} onChange={(event) => selectBasis(event.target.value)}><option value="">请选择设计输入</option>{bases.map((item) => <option value={item.sourceId} key={item.sourceId}>{item.sourceLabel}</option>)}</select></label><label><span>工程系统</span><select value={systemId} onChange={(event) => setSystemId(event.target.value)}><option value="all">全部工程系统</option>{facilityDomains.map((domain) => <optgroup label={domain.id + " · " + domain.name} key={domain.id}>{facilitySystems.filter((item) => item.domainId === domain.id).map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</optgroup>)}</select></label><label><span>材质</span><select value={material} onChange={(event) => setMaterial(event.target.value)}>{["全部材质","316L","PFA","PVDF","304L","PP-H","球墨铸铁","碳钢","HDPE"].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>连接方式</span><select value={connection} onChange={(event) => setConnection(event.target.value)}>{["全部连接","VCR","自动焊","Flare","IR Fusion","双卡套","沟槽","法兰"].map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <label className="showBlockedToggle"><input type="checkbox" checked={showBlocked} onChange={(event) => setShowBlocked(event.target.checked)}/> 显示不符合设计输入的候选</label>
    </section>
    <div className="catalogHeader"><p>找到 <b>{shown.length}</b> 项管路材料 <span>· 匹配结果来自当前项目设计输入</span></p></div>
    {!shown.length && <section className="card emptyState"><b>没有满足当前设计输入的标准候选</b><p>可勾选“显示不符合项”查看阻断原因，或在工程主数据中补充自定义材料和规格。</p></section>}
    <div className="catalogGrid">{shown.map((item) => {
      const system = getFacilitySystem(item.systemId)!;
      const result = matches.get(item.id) as PipeMatchResult | null | undefined;
      const resultLabel = !result ? "待选择设计输入" : result.status === "blocked" ? "不符合" : result.status === "warning" ? "有条件通过" : "全部通过";
      return <article className={`card catalogCard pipeCatalogCard ${result?.status || "unvalidated"}`} key={item.id}><div className="catalogVisual"><div className="pipeShape"><i/><i/><i/></div><span>{result ? `工程匹配 ${result.score}% · ${resultLabel}` : resultLabel}</span></div><div className="catalogBody"><div className="catalogTitle"><div><small>{item.catalogCode ?? item.id}{item.source === "material_master" ? " · 项目材料主数据" : ""}</small><h3>{item.name}</h3></div><span className={"chip " + system.color}>{system.name}</span></div><div className="catalogSpecs"><div><span>材质</span><b>{item.material}</b></div><div><span>连接</span><b>{item.connection}</b></div><div><span>规格</span><b>{item.size}</b></div><div><span>洁净等级</span><b>{item.cleanliness}</b></div></div><div className="pressureMeter"><span>设计耐压</span><div><i style={{ width: Math.min(100, item.pressure * 10) + "%" }}/></div><b>{item.pressure} MPa / {item.temp}°C</b></div>{result && <div className="selectionCheckSummary">{result.checks.map((check) => <span className={check.status} title={check.message} key={check.code}>{check.status === "pass" ? "✓" : check.status === "warning" ? "!" : "×"} {check.label}</span>)}</div>}{result?.blockers[0] && <p className="selectionBlocker">{result.blockers[0]}</p>}<div className="catalogFoot"><span><small>参考单价</small><b>{item.price ? `¥ ${item.price.toLocaleString()}` : "待询价"}</b> / {item.pack}</span><button disabled={!activeBasis || result?.status === "blocked"} className={selected.includes(item.id) ? "addedButton" : ""} onClick={() => setSelected(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])}>{result?.status === "blocked" ? "不可选" : selected.includes(item.id) ? "✓ 已选择" : "＋ 选择"}</button></div></div></article>;
    })}</div>
  </>;
}