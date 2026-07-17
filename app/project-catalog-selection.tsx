"use client";

import { useEffect, useMemo, useState } from "react";
import { facilitySystems } from "@/lib/facility-systems";
import { getCurrentProjectId } from "@/lib/project-context";
import { openMasterData } from "@/lib/client-actions";
import { parseTechnicalSpecFile, type TechnicalSpecParseResult } from "@/lib/technical-spec-parser";

type Notify = (message: string) => void;
type Category = { id: string; code: string; name: string };
type Requirement = {
  id: string; projectId: string; requirementCode: string; title: string; systemCode: string; categoryId: string;
  attachmentId?: string | null; sourceFileName: string; sourceRevision: string; medium: string; designPressureMpa?: number | null;
  designTemperatureC?: number | null; nominalSize: string; connectionStandard: string; requiredMaterialsJson: string;
  requiredCertificationsJson: string; requiredStandardsJson: string; requiredBrandsJson: string; requiredSpecificationsJson: string;
  notes: string; status: string; selectionStatus: string; selectedProductId?: string | null;
};
type MatchCheck = { code: string; label: string; status: "pass" | "warning" | "fail"; expected: string; actual: string; message: string };
type MatchResult = {
  id: string; productId: string; score: number; status: "passed" | "attention" | "blocked"; checks: MatchCheck[];
  product: { id: string; brand: string; model: string; productCode: string; productName: string; nominalSize?: string | null; connectionStandard?: string | null } | null;
};
type Candidate = {
  id: string; candidateCode: string; proposedProductName: string; manufacturer: string; brand: string; model: string; supplier: string;
  rfqNumber: string; technicalQueryNumber: string; status: string; promotedProductId?: string | null; assignedTo?: string | null;
};type Draft = {
  requirementCode: string; title: string; systemCode: string; categoryId: string; sourceRevision: string; medium: string;
  designPressureMpa: string; designTemperatureC: string; nominalSize: string; connectionStandard: string; materials: string;
  certifications: string; standards: string; brands: string; specifications: string; notes: string;
};

const blankDraft = (): Draft => ({
  requirementCode: `SEL-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-`, title: "", systemCode: "", categoryId: "", sourceRevision: "A",
  medium: "", designPressureMpa: "", designTemperatureC: "", nominalSize: "", connectionStandard: "", materials: "", certifications: "",
  standards: "", brands: "", specifications: "{}", notes: "",
});
const asList = (value: string) => value.split(/[，,;；\n]/).map((item) => item.trim()).filter(Boolean);
const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);
const statusText = { unmatched: "待匹配", matched: "已匹配", selected: "已选用", blocked: "无合格项" } as Record<string, string>;
const resultText = { passed: "符合", attention: "需确认", blocked: "不符合" } as Record<string, string>;

export function ProjectCatalogSelection({ categories, notify }: { categories: Category[]; notify: Notify }) {
  const [projectId, setProjectId] = useState("");
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [canPromote, setCanPromote] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [file, setFile] = useState<File | null>(null);
  const [extraction, setExtraction] = useState<TechnicalSpecParseResult | null>(null);
  const [extracting, setExtracting] = useState(false);

  const selected = requirements.find((item) => item.id === selectedId) ?? null;
  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);

  const loadResults = async (targetProjectId: string, requirementId: string) => {
    if (!targetProjectId || !requirementId) { setResults([]); return; }
    const response = await fetch(`/api/catalog-selection?projectId=${encodeURIComponent(targetProjectId)}&requirementId=${encodeURIComponent(requirementId)}`, { cache: "no-store" });
    const payload = await response.json() as { error?: string; results?: MatchResult[] };
    if (!response.ok) throw new Error(payload.error || "匹配结果加载失败");
    setResults(payload.results ?? []);
  };

  const loadCandidates = async (targetProjectId: string, requirementId: string) => {
    if (!targetProjectId || !requirementId) { setCandidates([]); return; }
    const response = await fetch(`/api/catalog-candidates?projectId=${encodeURIComponent(targetProjectId)}&requirementId=${encodeURIComponent(requirementId)}`, { cache: "no-store" });
    const payload = await response.json() as { error?: string; candidates?: Candidate[]; permissions?: { canPromote?: boolean } };
    if (!response.ok) throw new Error(payload.error || "候选产品加载失败");
    setCandidates(payload.candidates ?? []); setCanPromote(Boolean(payload.permissions?.canPromote));
  };
  const load = async (preferredId?: string) => {
    const currentProjectId = getCurrentProjectId();
    setProjectId(currentProjectId);
    if (!currentProjectId) { setRequirements([]); setSelectedId(""); setResults([]); return; }
    const response = await fetch(`/api/master-data?entities=projectProductRequirements&projectId=${encodeURIComponent(currentProjectId)}&pageSize=500`, { cache: "no-store" });
    const payload = await response.json() as { error?: string; data?: { projectProductRequirements?: Requirement[] }; permissions?: { canWrite?: boolean } };
    if (!response.ok) throw new Error(payload.error || "项目选型要求加载失败");
    const rows = (payload.data?.projectProductRequirements ?? []).filter((item) => item.status !== "archived");
    const nextId = preferredId && rows.some((item) => item.id === preferredId) ? preferredId : selectedId && rows.some((item) => item.id === selectedId) ? selectedId : rows[0]?.id ?? "";
    setRequirements(rows); setSelectedId(nextId); setCanWrite(Boolean(payload.permissions?.canWrite));
    await Promise.all([loadResults(currentProjectId, nextId), loadCandidates(currentProjectId, nextId)]);
  };

  // Project context is read from the formal route on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => void load().catch((cause) => setError(cause instanceof Error ? cause.message : "项目选型加载失败")), 0); return () => window.clearTimeout(timer); }, []);

  const handleSpecFile = async (selectedFile: File | null) => {
    setFile(selectedFile); setExtraction(null); setError("");
    if (!selectedFile) return;
    setExtracting(true);
    try {
      const parsed = await parseTechnicalSpecFile(selectedFile);
      setExtraction(parsed);
      const category = categories.find((item) => item.code === parsed.extracted.categoryHint);
      setDraft((current) => ({
        ...current,
        title: current.title || parsed.extracted.title || "",
        systemCode: parsed.extracted.systemCode || current.systemCode,
        categoryId: category?.id || current.categoryId,
        medium: parsed.extracted.medium || current.medium,
        designPressureMpa: parsed.extracted.designPressureMpa === undefined ? current.designPressureMpa : String(parsed.extracted.designPressureMpa),
        designTemperatureC: parsed.extracted.designTemperatureC === undefined ? current.designTemperatureC : String(parsed.extracted.designTemperatureC),
        nominalSize: parsed.extracted.nominalSize || current.nominalSize,
        connectionStandard: parsed.extracted.connectionStandard || current.connectionStandard,
        materials: parsed.extracted.materials.length ? parsed.extracted.materials.join(", ") : current.materials,
        standards: parsed.extracted.standards.length ? parsed.extracted.standards.join(", ") : current.standards,
        certifications: parsed.extracted.certifications.length ? parsed.extracted.certifications.join(", ") : current.certifications,
        brands: parsed.extracted.brands.length ? parsed.extracted.brands.join(", ") : current.brands,
      }));
      notify(parsed.parserType === "metadata_only" ? "该格式暂不能自动读取正文，已保留原文件，请人工确认参数" : `已自动提取 ${Object.values(parsed.extracted).filter((value) => Array.isArray(value) ? value.length : value !== undefined && value !== "").length} 类技术条件，请确认`);
    } catch (cause) { setError(cause instanceof Error ? `规格书解析失败：${cause.message}` : "规格书解析失败"); }
    finally { setExtracting(false); }
  };

  const updateDraft = (key: keyof Draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const chooseRequirement = (id: string) => {
    setSelectedId(id); setError("");
    void Promise.all([loadResults(projectId, id), loadCandidates(projectId, id)]).catch((cause) => setError(cause instanceof Error ? cause.message : "选型数据加载失败"));
  };

  const createRequirement = async () => {
    if (!projectId) { setError("请先从具体项目路由进入产品型录"); return; }
    if (!file || !draft.requirementCode.trim() || !draft.title.trim() || !draft.systemCode || !draft.categoryId) { setError("请填写需求编号、名称、系统、分类并上传技术规格书"); return; }
    let specifications: Record<string, unknown>;
    try { specifications = JSON.parse(draft.specifications || "{}"); }
    catch { setError("分类专用要求必须是有效 JSON"); return; }
    setBusy(true); setError("");
    let createdId = "";
    try {
      const response = await fetch("/api/master-data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        entity: "projectProductRequirements",
        data: {
          projectId, requirementCode: draft.requirementCode, title: draft.title, systemCode: draft.systemCode, categoryId: draft.categoryId,
          sourceRevision: draft.sourceRevision || "A", medium: draft.medium, designPressureMpa: numberOrNull(draft.designPressureMpa),
          designTemperatureC: numberOrNull(draft.designTemperatureC), nominalSize: draft.nominalSize, connectionStandard: draft.connectionStandard,
          requiredMaterialsJson: asList(draft.materials), requiredCertificationsJson: asList(draft.certifications), requiredStandardsJson: asList(draft.standards),
          requiredBrandsJson: asList(draft.brands), requiredSpecificationsJson: specifications, notes: draft.notes, status: "draft", selectionStatus: "unmatched",
        },
      }) });
      const payload = await response.json() as { error?: string; item?: Requirement };
      if (!response.ok || !payload.item) throw new Error(payload.error || "选型要求创建失败");
      createdId = payload.item.id;
      const form = new FormData();
      form.set("file", file); form.set("projectId", projectId); form.set("entityType", "projectProductRequirements"); form.set("entityId", createdId); form.set("category", "technical_specification");
      const uploadResponse = await fetch("/api/files", { method: "POST", body: form });
      const uploadPayload = await uploadResponse.json() as { error?: string; file?: { id: string; fileName: string } };
      if (!uploadResponse.ok || !uploadPayload.file) throw new Error(`需求草稿已创建，但规格书上传失败：${uploadPayload.error || "R2 未配置"}`);
      const patchResponse = await fetch("/api/master-data", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
        entity: "projectProductRequirements", id: createdId, data: { attachmentId: uploadPayload.file.id, sourceFileName: uploadPayload.file.fileName, status: "active" },
      }) });
      const patchPayload = await patchResponse.json() as { error?: string };
      if (!patchResponse.ok) throw new Error(patchPayload.error || "规格书关联失败");
      if (extraction) {
        const extractionResponse = await fetch("/api/technical-specs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, requirementId: createdId, attachmentId: uploadPayload.file.id, fileName: uploadPayload.file.fileName, parserType: extraction.parserType, pageCount: extraction.pageCount, extracted: extraction.extracted, confidence: extraction.confidence, textExcerpt: extraction.textExcerpt, confirmed: true }) });
        const extractionPayload = await extractionResponse.json() as { error?: string };
        if (!extractionResponse.ok) throw new Error(extractionPayload.error || "自动提取记录保存失败");
      }
      setDraft(blankDraft()); setFile(null); setExtraction(null); setCreating(false); await load(createdId); notify("项目技术规格书、自动提取结果和选型要求已保存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "选型要求创建失败");
      if (createdId) await load(createdId).catch(() => undefined);
    } finally { setBusy(false); }
  };

  const runMatch = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/catalog-selection", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "match", projectId, requirementId: selected.id }) });
      const payload = await response.json() as { error?: string; results?: MatchResult[] };
      if (!response.ok) throw new Error(payload.error || "型录匹配失败");
      setResults(payload.results ?? []); await load(selected.id); notify(`已完成全局型录匹配，找到 ${(payload.results ?? []).filter((item) => item.status !== "blocked").length} 个可用候选`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "型录匹配失败"); }
    finally { setBusy(false); }
  };

  const selectProduct = async (result: MatchResult) => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const latestResponse = await fetch(`/api/catalog-selection?projectId=${encodeURIComponent(projectId)}&requirementId=${encodeURIComponent(selected.id)}`, { cache: "no-store" });
      const latest = await latestResponse.json() as { error?: string; run?: { id: string } | null };
      if (!latestResponse.ok || !latest.run) throw new Error(latest.error || "请先执行匹配");
      const response = await fetch("/api/catalog-selection", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "select", projectId, requirementId: selected.id, runId: latest.run.id, productId: result.productId, quantity: 1 }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "产品选用失败");
      await load(selected.id); notify(`${result.product?.brand ?? "产品"} ${result.product?.model ?? ""} 已选入当前项目 BOM`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "产品选用失败"); }
    finally { setBusy(false); }
  };

  const submitSelectionGate = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/release-gates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, gateType: "catalog_selection", entityType: "projectProductRequirements", entityId: selected.id, revision: selected.sourceRevision, title: `${selected.requirementCode} · ${selected.title} 选型冻结` }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "选型冻结审批提交失败");
      notify("产品选型冻结审批已提交，审批通过后形成不可变发布基线");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "选型冻结审批提交失败"); }
    finally { setBusy(false); }
  };
  const candidateAction = async (action: "create" | "submit_review" | "mark_ready" | "promote", id?: string) => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/catalog-candidates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id, projectId, requirementId: selected.id }) });
      const payload = await response.json() as { error?: string; product?: { productName: string } };
      if (!response.ok) throw new Error(payload.error || "候选产品操作失败");
      await loadCandidates(projectId, selected.id);
      notify(action === "create" ? "已生成询价 / TQ / 品牌报审候选记录" : action === "promote" ? `${payload.product?.productName || "候选产品"} 已转入全局型录待复核` : "候选产品状态已更新");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "候选产品操作失败"); }
    finally { setBusy(false); }
  };
  return <section className="card projectCatalogSelection" id="project-catalog-selection">
    <header><div><span>PROJECT SPECIFICATION SELECTION</span><h3>项目技术规格选型</h3><p>项目保存自己的规格书、工程条件和选用结果；候选产品始终来自下方全局型录库。</p></div><div><b>全局型录 · 项目引用</b><button disabled={!projectId || !canWrite} onClick={() => setCreating((value) => !value)}>{creating ? "收起" : "＋ 新建选型要求"}</button></div></header>
    {!projectId && <div className="catalogSelectionNotice"><i>i</i><span><b>当前未进入具体项目</b><small>全局型录仍可浏览；请从项目工作台进入后上传该项目的技术规格书并选型。</small></span></div>}
    {error && <div className="masterError"><i>!</i><span><b>项目选型需要处理</b><small>{error}</small></span><button onClick={() => setError("")}>×</button></div>}
    {creating && <div className="catalogRequirementForm">
      <div className="catalogRequirementGuide"><b>1 上传项目规格书</b><i>→</i><b>2 确认关键条件</b><i>→</i><b>3 匹配全局型录</b><i>→</i><b>4 选入项目 BOM</b></div>
      <div className="catalogRequirementFields">
        <label><span>需求编号 *</span><input value={draft.requirementCode} onChange={(event) => updateDraft("requirementCode", event.target.value)} placeholder="SEL-GAS-001" /></label>
        <label className="wide"><span>设备 / 材料名称 *</span><input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} placeholder="VMB 高压隔膜阀" /></label>
        <label><span>项目系统 *</span><select value={draft.systemCode} onChange={(event) => updateDraft("systemCode", event.target.value)}><option value="">请选择</option>{facilitySystems.map((system) => <option key={system.id} value={system.code}>{system.code} · {system.name}</option>)}</select></label>
        <label><span>产品分类 *</span><select value={draft.categoryId} onChange={(event) => updateDraft("categoryId", event.target.value)}><option value="">请选择</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.code} · {category.name}</option>)}</select></label>
        <label><span>规格书版本</span><input value={draft.sourceRevision} onChange={(event) => updateDraft("sourceRevision", event.target.value)} /></label>
        <label className="file wide"><span>项目技术规格书 *</span><input type="file" accept=".pdf,.txt,.csv,.json,.md,.doc,.docx,.xls,.xlsx,image/*" onChange={(event) => void handleSpecFile(event.target.files?.[0] ?? null)} /><b>{extracting ? "正在解析 PDF 技术条款…" : file?.name || "选择 PDF / 文本 / Word / Excel / 图片"}</b><small>{extraction ? `${extraction.parserType} · ${extraction.pageCount || "—"} 页 · 已提取，请核对下方高亮字段` : "PDF/文本自动提取；Word/Excel 暂保留原件并人工确认。"}</small></label>
        <label><span>介质</span><input value={draft.medium} onChange={(event) => updateDraft("medium", event.target.value)} /></label>
        <label><span>设计压力 MPa</span><input type="number" step="any" value={draft.designPressureMpa} onChange={(event) => updateDraft("designPressureMpa", event.target.value)} /></label>
        <label><span>设计温度 °C</span><input type="number" step="any" value={draft.designTemperatureC} onChange={(event) => updateDraft("designTemperatureC", event.target.value)} /></label>
        <label><span>公称尺寸</span><input value={draft.nominalSize} onChange={(event) => updateDraft("nominalSize", event.target.value)} /></label>
        <label><span>接口标准</span><input value={draft.connectionStandard} onChange={(event) => updateDraft("connectionStandard", event.target.value)} /></label>
        <label className="wide"><span>要求材质</span><input value={draft.materials} onChange={(event) => updateDraft("materials", event.target.value)} placeholder="316L VAR, PCTFE" /></label>
        <label className="wide"><span>准入品牌</span><input value={draft.brands} onChange={(event) => updateDraft("brands", event.target.value)} placeholder="Swagelok, Fujikin" /></label>
        <label className="wide"><span>要求标准</span><input value={draft.standards} onChange={(event) => updateDraft("standards", event.target.value)} placeholder="SEMI F20, ASME B31.3" /></label>
        <label className="wide"><span>要求认证</span><input value={draft.certifications} onChange={(event) => updateDraft("certifications", event.target.value)} placeholder="CE, ATEX" /></label>
        <label className="wide"><span>分类专用要求 JSON</span><textarea value={draft.specifications} onChange={(event) => updateDraft("specifications", event.target.value)} placeholder={'{"flow":{"min":100},"ipRating":{"equals":"IP65"}}'} /></label>
        <label className="wide"><span>条款 / 备注</span><textarea value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} /></label>
      </div><footer><button disabled={busy} onClick={() => setCreating(false)}>取消</button><button className="primaryButton" disabled={busy || !canWrite} onClick={() => void createRequirement()}>{busy ? "保存中…" : "保存规格书与选型要求"}</button></footer>
    </div>}
    <div className="catalogSelectionWorkspace">
      <aside><div className="catalogSelectionPaneTitle"><b>项目选型要求</b><span>{requirements.length}</span></div>{requirements.length ? requirements.map((item) => <button className={item.id === selectedId ? "active" : ""} key={item.id} onClick={() => chooseRequirement(item.id)}><i>{item.attachmentId ? "▧" : "!"}</i><span><b>{item.requirementCode} · {item.title}</b><small>{item.systemCode} · {categoryMap.get(item.categoryId)?.name || "未分类"} · {item.sourceFileName || "未上传规格书"}</small></span><em className={item.selectionStatus}>{statusText[item.selectionStatus] || item.selectionStatus}</em></button>) : <div className="catalogSelectionEmpty">当前项目尚无选型要求</div>}</aside>
      <main>{selected ? <><div className="catalogSelectedRequirement"><div><span>当前工程条件</span><h4>{selected.title}</h4><p>{selected.requirementCode} · {selected.systemCode} · {categoryMap.get(selected.categoryId)?.name || "未分类"}</p></div><dl><div><dt>规格书</dt><dd>{selected.sourceFileName || "未关联"} / Rev.{selected.sourceRevision}</dd></div><div><dt>工况</dt><dd>{selected.designPressureMpa ?? "—"} MPa · {selected.designTemperatureC ?? "—"} °C</dd></div><div><dt>接口</dt><dd>{selected.connectionStandard || "—"} · {selected.nominalSize || "—"}</dd></div></dl><div className="catalogSelectionActions"><button disabled={busy || !canWrite || !selected.attachmentId} onClick={() => void runMatch()}>{busy ? "校验中…" : results.length ? "重新匹配全局型录" : "匹配全局型录"}</button><button className="primaryButton" disabled={busy || !canWrite || selected.selectionStatus !== "selected"} onClick={() => void submitSelectionGate()}>提交选型冻结审批</button></div></div>
        {results.length ? <div className="catalogMatchList">{results.slice(0, 12).map((result) => { const problems = result.checks.filter((item) => item.status !== "pass"); return <article className={result.status} key={result.id}><header><span className="score">{result.score}</span><div><b>{result.product?.productName || "产品记录"}</b><small>{result.product?.brand} · {result.product?.model} · {result.product?.productCode}</small></div><em>{resultText[result.status]}</em></header><div>{problems.length ? problems.slice(0, 3).map((item) => <p className={item.status} key={item.code}><i>{item.status === "fail" ? "×" : "!"}</i><span><b>{item.label}</b><small>{item.message}；要求 {item.expected}，实际 {item.actual}</small></span></p>) : <p className="pass"><i>✓</i><span><b>工程条件全部符合</b><small>可进入项目 BOM 和后续审批</small></span></p>}</div><footer><button disabled={busy || !canWrite || result.status === "blocked"} onClick={() => void selectProduct(result)}>{result.status === "blocked" ? "禁止选用" : selected.selectedProductId === result.productId ? "已选入项目" : "选入项目 BOM"}</button></footer></article>; })}</div> : <div className="catalogSelectionEmpty large"><i>⌁</i><b>尚未运行全局型录匹配</b><small>系统会逐项校验分类、系统、介质、压力、温度、尺寸、接口、材质、品牌、标准、认证和分类专用参数。</small></div>}{(selected.selectionStatus === "blocked" || candidates.length > 0) && <section className="candidateWorkflowBoard"><header><div><span>NO-MATCH WORKFLOW</span><h4>未匹配产品闭环</h4><p>没有合格型录时，不直接创建正式产品；先完成询价、TQ 技术澄清、供应商资料和品牌报审。</p></div>{!candidates.length && <button disabled={busy || !canWrite} onClick={() => void candidateAction("create")}>生成候选记录</button>}</header>{candidates.map((candidate) => <article key={candidate.id}><div><code>{candidate.candidateCode}</code><b>{candidate.proposedProductName}</b><small>{candidate.brand || "品牌待确认"} · {candidate.model || "型号待确认"} · {candidate.supplier || "供应商待确认"}</small></div><em>{candidate.status}</em><footer><button onClick={() => openMasterData("catalogCandidates", candidate.candidateCode)}>维护 RFQ / TQ 资料</button>{candidate.status === "vendor_data_received" && <button onClick={() => void candidateAction("submit_review", candidate.id)}>提交技术审查</button>}{["technical_review", "brand_approval"].includes(candidate.status) && <button onClick={() => void candidateAction("mark_ready", candidate.id)}>确认报审完成</button>}{candidate.status === "ready_for_catalog" && canPromote && <button className="primaryButton" onClick={() => void candidateAction("promote", candidate.id)}>转入全局型录待复核</button>}</footer></article>)}</section>}</> : <div className="catalogSelectionEmpty large"><i>▧</i><b>请选择或新建项目选型要求</b><small>项目数据与全局型录分离，选用时仅保存产品引用和校验记录。</small></div>}</main>
    </div>
  </section>;
}