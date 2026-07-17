"use client";

import { useEffect, useRef, useState } from "react";
import { downloadCsv, downloadText, openMasterData, parseCsv } from "@/lib/client-actions";
import { facilityDomains, facilitySystems } from "@/lib/facility-systems";
import { getCurrentProjectId, updateProjectUrl } from "@/lib/project-context";
import { resolveProjectSystem } from "@/lib/project-systems-client";
import type { PipeSelectionBasis } from "@/lib/pipe-selection-engine";

type Notify = (message: string) => void;
type MediaConditionRow = {
  id: number;
  systemId: string;
  systemName: string;
  tagNo: string;
  medium: string;
  phase: string;
  purity: string;
  operatingPressure: number;
  designPressure: number;
  operatingTemperature: number;
  designTemperature: number;
  flow: number;
  flowUnit: string;
  connection: string;
  nominalSize: string;
  cleanliness: string;
  doubleContainment: boolean;
};

const initialRows: MediaConditionRow[] = [
  { id: 1, systemId: "sys-sgas", systemName: "电子特气 VMB", tagNo: "VMB-SIH4-001", medium: "SiH4", phase: "气体", purity: "6N", operatingPressure: .72, designPressure: 1, operatingTemperature: 35, designTemperature: 60, flow: 120, flowUnit: "SLM", connection: "VCR", nominalSize: "1/4”", cleanliness: "UHP", doubleContainment: false },
  { id: 2, systemId: "sys-upw", systemName: "超纯水 UPW", tagNo: "UPW-L2-201", medium: "UPW", phase: "液体", purity: "18.2 MΩ·cm", operatingPressure: .55, designPressure: 1, operatingTemperature: 25, designTemperature: 85, flow: 32, flowUnit: "m³/h", connection: "自动焊", nominalSize: "DN80", cleanliness: "UPW", doubleContainment: false },
  { id: 3, systemId: "sys-exh", systemName: "工艺排风", tagNo: "EXH-ACID-031", medium: "酸性排风", phase: "含尘气体", purity: "含 HF / HCl 痕量", operatingPressure: -.002, designPressure: .01, operatingTemperature: 28, designTemperature: 60, flow: 18000, flowUnit: "m³/h", connection: "法兰", nominalSize: "DN900", cleanliness: "Industrial", doubleContainment: true },
];

function PageTop({ actions }: { actions: React.ReactNode }) {
  return <div className="moduleTop"><div><span>MEDIA DESIGN BASIS</span><h2>介质工况参数录入</h2><p>定义各系统的介质、压力温度、流量、纯度与接口边界，为材料和设备选型提供唯一设计输入</p></div><div className="moduleActions">{actions}</div></div>;
}

export function MediaConditionsPage({ notify }: { notify: Notify }) {
  const importFile = useRef<HTMLInputElement>(null);
  const [systemId, setSystemId] = useState("sys-sgas");
  const [tagNo, setTagNo] = useState("VMB-SIH4-002");
  const [medium, setMedium] = useState("SiH4");
  const [phase, setPhase] = useState("气体");
  const [purity, setPurity] = useState("6N / 99.9999%");
  const [operatingPressure, setOperatingPressure] = useState(.72);
  const [designPressure, setDesignPressure] = useState(1);
  const [operatingTemperature, setOperatingTemperature] = useState(35);
  const [designTemperature, setDesignTemperature] = useState(60);
  const [flow, setFlow] = useState(120);
  const [flowUnit, setFlowUnit] = useState("SLM");
  const [connection, setConnection] = useState("VCR");
  const [nominalSize, setNominalSize] = useState("1/4”");
  const [cleanliness, setCleanliness] = useState("UHP");
  const [doubleContainment, setDoubleContainment] = useState(false);
  const [rows, setRows] = useState<MediaConditionRow[]>(() => {
    if (typeof window === "undefined") return initialRows;
    try {
      const saved = window.localStorage.getItem("fabflow:media-condition-drafts");
      const parsed = saved ? JSON.parse(saved) as MediaConditionRow[] : null;
      return Array.isArray(parsed) && parsed.length ? parsed : initialRows;
    } catch { return initialRows; }
  });
  const activeSystem = facilitySystems.find((item) => item.id === systemId) || facilitySystems[0];
  const activeDomain = facilityDomains.find((domain) => domain.id === activeSystem.domainId);
  const normalizedMedium = medium.trim().toUpperCase();
  const hazardous = ["SIH4", "CL2", "H2", "NH3", "HF", "HCL", "PH3", "B2H6"].some((code) => normalizedMedium.includes(code));
  const pressureInvalid = designPressure < operatingPressure;
  const temperatureInvalid = designTemperature < operatingTemperature;
  const margin = operatingPressure > 0 ? Math.round((designPressure - operatingPressure) / operatingPressure * 100) : 100;
  const conditionStatus = pressureInvalid || temperatureInvalid ? "fatal" : hazardous ? "warning" : "safe";
  const materialAdvice = normalizedMedium.includes("HF")
    ? "HP PFA / PTFE，按浓度复核"
    : normalizedMedium.includes("HCL")
      ? "PFA / PTFE，316L 需腐蚀评估"
      : normalizedMedium.includes("CL2")
        ? "316L EP + PCTFE / FFKM"
        : normalizedMedium.includes("UPW")
          ? "HP PVDF 或指定等级 316L EP"
          : normalizedMedium.includes("SIH4")
            ? "316L EP + 金属垫片 VCR"
            : "进入介质—材料兼容矩阵复核";

  useEffect(() => {
    try { window.localStorage.setItem("fabflow:media-condition-drafts", JSON.stringify(rows)); } catch {}
  }, [rows]);

  const currentRow = (): MediaConditionRow => ({
    id: Date.now(),
    systemId,
    systemName: activeSystem.name,
    tagNo: tagNo.trim() || activeSystem.code + "-" + Date.now(),
    medium: medium.trim(),
    phase,
    purity: purity.trim(),
    operatingPressure,
    designPressure,
    operatingTemperature,
    designTemperature,
    flow,
    flowUnit,
    connection,
    nominalSize,
    cleanliness,
    doubleContainment,
  });

  const addCondition = () => {
    if (!medium.trim()) { notify("请先填写介质名称"); return; }
    const next = currentRow();
    setRows((previous) => [next, ...previous.filter((row) => row.tagNo !== next.tagNo)]);
    notify(next.tagNo + " 已加入介质工况草稿清单");
  };

  const saveTag = async (openSelection = false) => {
    if (!medium.trim() || !tagNo.trim()) { notify("Tag 编号和介质为必填项"); return; }
    if (pressureInvalid || temperatureInvalid) { notify("设计压力和设计温度不得低于操作工况"); return; }
    try {
      const projectId = getCurrentProjectId();
      const projectSystem = await resolveProjectSystem(activeSystem, true);
      if (!projectSystem) throw new Error("当前项目系统解析失败");
      const tagSearch = await fetch(`/api/master-data?entity=tags&projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(tagNo.trim())}`, { cache: "no-store" });
      const tagPayload = await tagSearch.json();
      if (!tagSearch.ok) throw new Error(tagPayload.error || "Tag 查询失败");
      const existingTag = (tagPayload.data?.tags ?? []).find((item: { tagNo: string }) => item.tagNo === tagNo.trim());
      const response = await fetch("/api/master-data", {
        method: existingTag ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: "tags",
          id: existingTag?.id,
          data: {
            projectId,
            systemId: projectSystem.id,
            tagNo: tagNo.trim(),
            entityType: "line",
            description: activeSystem.code + " · " + activeSystem.name + " · " + phase + " · " + purity + " · " + flow + " " + flowUnit + " · " + connection + " " + nominalSize + (doubleContainment ? " · 双套管" : ""),
            designPressureMpa: designPressure,
            designTemperatureC: designTemperature,
            medium: medium.trim(),
            status: "design",
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Tag 写入失败");
      const savedTag = payload.item as { id: string };
      const interfaceCode = "IF-" + tagNo.trim();
      const interfaceSearch = await fetch(`/api/master-data?entity=interfaces&projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(interfaceCode)}`, { cache: "no-store" });
      const interfacePayload = await interfaceSearch.json();
      if (!interfaceSearch.ok) throw new Error(interfacePayload.error || "接口查询失败");
      const existingInterface = (interfacePayload.data?.interfaces ?? []).find((item: { interfaceCode: string }) => item.interfaceCode === interfaceCode);
      const interfaceResponse = await fetch("/api/master-data", {
        method: existingInterface ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: "interfaces", id: existingInterface?.id, data: {
          projectId,
          fromTagId: savedTag.id,
          interfaceCode,
          medium: medium.trim(),
          connectionStandard: connection,
          nominalSize,
          designPressureMpa: designPressure,
          designTemperatureC: designTemperature,
          cleanlinessGrade: cleanliness,
          ownerDiscipline: activeDomain?.name ?? activeSystem.domainId,
          status: existingInterface?.status ?? "open",
        } }),
      });
      const savedInterfacePayload = await interfaceResponse.json();
      if (!interfaceResponse.ok) throw new Error(savedInterfacePayload.error || "接口写入失败");
      const next = currentRow();
      setRows((previous) => [next, ...previous.filter((row) => row.tagNo !== next.tagNo)]);
      const selectionBasis: PipeSelectionBasis = {
        sourceType: "interface",
        sourceId: savedInterfacePayload.item.id,
        sourceLabel: `${tagNo.trim()} · ${medium.trim()} · ${connection} ${nominalSize}`,
        systemId: activeSystem.id,
        medium: medium.trim(),
        designPressureMpa: designPressure,
        designTemperatureC: designTemperature,
        connectionStandard: connection,
        nominalSize,
        cleanlinessGrade: cleanliness,
      };
      window.sessionStorage.setItem("fabflow:pipe-selection-basis", JSON.stringify(selectionBasis));
      notify(tagNo + " 已写入 Tag 与接口台账，可用于材料选型");
      if (openSelection) updateProjectUrl(projectId, "管路接头选型");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Tag 与接口写入失败");
    }
  };
  const exportConditions = () => {
    downloadCsv(
      "fabflow-media-conditions-" + Date.now() + ".csv",
      ["系统", "Tag", "介质", "相态", "纯度/浓度", "操作压力 MPa", "设计压力 MPa", "操作温度 °C", "设计温度 °C", "流量", "流量单位", "连接形式", "公称尺寸", "洁净等级", "双套管"],
      rows.map((row) => [row.systemName, row.tagNo, row.medium, row.phase, row.purity, row.operatingPressure, row.designPressure, row.operatingTemperature, row.designTemperature, row.flow, row.flowUnit, row.connection, row.nominalSize, row.cleanliness, row.doubleContainment ? "是" : "否"]),
    );
    notify("介质工况清单已导出");
  };

  const importConditions = async (file: File) => {
    try {
      const matrix = parseCsv(await file.text());
      if (matrix.length < 2) throw new Error("工况表必须包含表头和数据");
      const header = matrix[0];
      const at = (...names: string[]) => header.findIndex((value) => names.includes(value));
      const imported = matrix.slice(1).map((cells, index) => {
        const systemName = cells[at("系统", "系统名称")] || "电子特气 VMB";
        const system = facilitySystems.find((item) => item.name === systemName || item.shortName === systemName || item.code === systemName) || facilitySystems[0];
        return {
          id: Date.now() + index,
          systemId: system.id,
          systemName: system.name,
          tagNo: cells[at("Tag", "Tag编号")] || system.code + "-IMPORT-" + (index + 1),
          medium: cells[at("介质")] || "未定义",
          phase: cells[at("相态")] || "气体",
          purity: cells[at("纯度/浓度", "纯度", "浓度")] || "待确认",
          operatingPressure: Number(cells[at("操作压力 MPa", "操作压力")]) || 0,
          designPressure: Number(cells[at("设计压力 MPa", "设计压力")]) || 0,
          operatingTemperature: Number(cells[at("操作温度 °C", "操作温度")]) || 25,
          designTemperature: Number(cells[at("设计温度 °C", "设计温度")]) || 60,
          flow: Number(cells[at("流量")]) || 0,
          flowUnit: cells[at("流量单位")] || "m³/h",
          connection: cells[at("连接形式")] || "待确认",
          nominalSize: cells[at("公称尺寸")] || "待确认",
          cleanliness: cells[at("洁净等级")] || "Industrial",
          doubleContainment: ["是", "true", "1", "yes"].includes((cells[at("双套管")] || "").toLowerCase()),
        } as MediaConditionRow;
      });
      setRows(imported);
      notify("已导入 " + imported.length + " 条介质工况");
    } catch (error) {
      notify(error instanceof Error ? error.message : "工况表导入失败");
    } finally {
      if (importFile.current) importFile.current.value = "";
    }
  };

  const downloadBasis = () => {
    downloadText(
      "media-design-basis-" + (tagNo || Date.now()) + ".txt",
      [
        "FabFlow 介质工况设计输入",
        "系统：" + activeSystem.name + " (" + activeSystem.code + ")",
        "Tag：" + tagNo,
        "介质：" + medium + " / " + phase,
        "纯度或浓度：" + purity,
        "操作压力：" + operatingPressure + " MPa",
        "设计压力：" + designPressure + " MPa",
        "操作温度：" + operatingTemperature + " °C",
        "设计温度：" + designTemperature + " °C",
        "流量：" + flow + " " + flowUnit,
        "接口：" + connection + " " + nominalSize,
        "洁净等级：" + cleanliness,
        "双套管：" + (doubleContainment ? "是" : "否"),
        "材料建议：" + materialAdvice,
      ].join("\r\n"),
    );
    notify("介质设计输入单已下载");
  };

  return <>
    <PageTop actions={<>
      <button className="softButton" onClick={() => importFile.current?.click()}>导入工况表</button>
      <input ref={importFile} type="file" accept=".csv,text/csv" hidden onChange={(event) => event.target.files?.[0] && void importConditions(event.target.files[0])}/>
      <button className="softButton" onClick={exportConditions}>导出清单</button>
      <button className="softButton" onClick={() => void saveTag()}>保存 Tag 与接口</button><button className="primaryButton" onClick={() => void saveTag(true)}>保存并进入选型</button>
    </>}/>
    <div className="moduleGrid mediaConditionGrid">
      <section className="card moduleCard span8">
        <div className="moduleCardTitle"><div><i className="titleIcon bluebg">◇</i><span><b>工况设计输入</b><small>自定义输入，不限于预置介质与系统</small></span></div><em>01 / DESIGN BASIS</em></div>
        <div className="floatingFields mediaFields">
          <label><span>所属工程系统</span><select value={systemId} onChange={(event) => setSystemId(event.target.value)}>{facilityDomains.map((domain) => <optgroup label={domain.id + " · " + domain.name} key={domain.id}>{facilitySystems.filter((item) => item.domainId === domain.id).map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</optgroup>)}</select></label>
          <label><span>Tag / 管线编号</span><input value={tagNo} onChange={(event) => setTagNo(event.target.value)}/></label>
          <label><span>介质名称</span><input list="fabflow-medium-options" value={medium} onChange={(event) => setMedium(event.target.value)}/><datalist id="fabflow-medium-options"><option value="SiH4"/><option value="Cl2"/><option value="N2"/><option value="CDA"/><option value="UPW"/><option value="HF"/><option value="HCl"/><option value="酸性排风"/><option value="工艺冷却水"/></datalist></label>
          <label><span>相态</span><select value={phase} onChange={(event) => setPhase(event.target.value)}><option>气体</option><option>液体</option><option>气液两相</option><option>含尘气体</option><option>废液</option></select></label>
          <label><span>纯度 / 浓度 / 电阻率</span><input value={purity} onChange={(event) => setPurity(event.target.value)}/></label>
          <label><span>操作压力</span><input type="number" step="0.01" value={operatingPressure} onChange={(event) => setOperatingPressure(+event.target.value)}/><b>MPa</b></label>
          <label className={pressureInvalid ? "invalidField" : ""}><span>设计压力</span><input type="number" step="0.01" value={designPressure} onChange={(event) => setDesignPressure(+event.target.value)}/><b>MPa</b></label>
          <label><span>操作温度</span><input type="number" value={operatingTemperature} onChange={(event) => setOperatingTemperature(+event.target.value)}/><b>°C</b></label>
          <label className={temperatureInvalid ? "invalidField" : ""}><span>设计温度</span><input type="number" value={designTemperature} onChange={(event) => setDesignTemperature(+event.target.value)}/><b>°C</b></label>
          <label><span>设计流量</span><input type="number" value={flow} onChange={(event) => setFlow(+event.target.value)}/></label>
          <label><span>流量单位</span><select value={flowUnit} onChange={(event) => setFlowUnit(event.target.value)}><option>SLM</option><option>Nm³/h</option><option>m³/h</option><option>L/min</option><option>kg/h</option></select></label>
          <label><span>连接形式</span><select value={connection} onChange={(event) => setConnection(event.target.value)}><option>VCR</option><option>自动焊</option><option>法兰</option><option>Flare</option><option>双卡套</option><option>沟槽</option><option>待设备厂确认</option></select></label>
          <label><span>公称尺寸</span><input value={nominalSize} onChange={(event) => setNominalSize(event.target.value)}/></label>
          <label><span>洁净等级</span><select value={cleanliness} onChange={(event) => setCleanliness(event.target.value)}><option>UHP</option><option>HP</option><option>UPW</option><option>Clean</option><option>Industrial</option></select></label>
          <label className="switchField"><span>二次围堵</span><button type="button" className={doubleContainment ? "active" : ""} onClick={() => setDoubleContainment(!doubleContainment)}><i/>{doubleContainment ? "双套管 / 围堰" : "单管"}</button></label>
        </div>
        <div className="mediaFormActions"><button className="softButton" onClick={addCondition}>＋ 添加到工况清单</button><button className="softButton" onClick={downloadBasis}>下载设计输入单</button></div>
      </section>
      <aside className={"card moduleCard span4 mediaAssessment " + conditionStatus}>
        <div className="moduleCardTitle"><div><i className="titleIcon greenbg">✓</i><span><b>输入完整性与选型边界</b><small>随工况数据实时校核</small></span></div></div>
        <div className="assessmentStatus"><i>{conditionStatus === "fatal" ? "×" : conditionStatus === "warning" ? "!" : "✓"}</i><span><b>{conditionStatus === "fatal" ? "设计边界不成立" : conditionStatus === "warning" ? "危险介质，需专项校核" : "工况输入可用于选型"}</b><small>{conditionStatus === "fatal" ? "设计值不得低于操作值" : hazardous ? "需要材料兼容、泄漏与联锁复核" : "基础参数校核通过"}</small></span></div>
        <div className="conditionKpis"><div><span>压力设计裕量</span><b className={margin < 10 ? "redText" : "blueText"}>{margin}%</b></div><div><span>温度裕量</span><b>{designTemperature - operatingTemperature}<small>°C</small></b></div><div><span>工程域 / 系统</span><b>{activeDomain?.id} / {activeSystem.code}</b></div><div><span>接口边界</span><b>{connection}</b></div></div>
        <div className="materialAdvice"><span>推荐材料路线</span><b>{materialAdvice}</b><button onClick={() => openMasterData("materialCompatibility", medium)}>打开兼容矩阵 →</button></div>
      </aside>
      <section className="card moduleCard span12 tableCard mediaConditionTable">
        <div className="moduleCardTitle"><div><i className="titleIcon cyanbg">▤</i><span><b>介质工况清单</b><small>{rows.length} 条浏览器草稿 · 可导出或登记为权威 Tag</small></span></div><button className="softButton" disabled={!rows.length} onClick={() => { setRows([]); notify("介质工况草稿已清空"); }}>清空草稿</button></div>
        <div className="dataTable"><table><thead><tr><th>系统</th><th>Tag</th><th>介质 / 相态</th><th>纯度 / 浓度</th><th>操作 / 设计压力</th><th>操作 / 设计温度</th><th>流量</th><th>接口</th><th>洁净</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.systemName}</b></td><td><code>{row.tagNo}</code></td><td><b>{row.medium}</b><small>{row.phase}</small></td><td>{row.purity}</td><td>{row.operatingPressure} / <b className="blueText">{row.designPressure} MPa</b></td><td>{row.operatingTemperature} / <b>{row.designTemperature} °C</b></td><td>{row.flow} {row.flowUnit}</td><td>{row.connection} · {row.nominalSize}</td><td>{row.cleanliness}{row.doubleContainment ? " · 双套管" : ""}</td><td><button className="rowDelete" onClick={() => setRows((previous) => previous.filter((item) => item.id !== row.id))}>×</button></td></tr>)}</tbody></table></div>
      </section>
    </div>
  </>;
}
