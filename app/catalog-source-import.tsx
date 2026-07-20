"use client";

import { useMemo, useRef, useState } from "react";
import type { CatalogSourceManifestEntry } from "@/lib/catalog-source-ingestion";

type Notify = (message: string) => void;
type ImportStats = { total: number; queued: number; candidatesNeedsReview: number };
type SourceDocument = { id: string; fileName: string; relativePath: string; documentType: string; parserType: string; manufacturerHint: string; modelHint: string; extractionStatus: string; sizeBytes: number };
export type CatalogSourceCandidate = { id: string; productName: string; manufacturer: string; brand: string; model: string; categoryHint: string; confidence: number; status: string; sourceDocumentId: string; parametersJson: string };

const typeLabel: Record<string, string> = {
  manufacturer_catalog: "厂家型录", product_datasheet: "单品规格书", submittal_package: "送审资料", parameter_sheet: "参数表",
  bom_spreadsheet: "BOM/清单", equipment_drawing: "设备图纸", control_io_drawing: "自控/I/O图纸", product_image: "产品图片",
  certificate_manual: "证书/说明书", archive: "压缩包", other: "其他",
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

export function CatalogSourceImport({ canWriteGlobal, notify, onUseCandidate }: { canWriteGlobal: boolean; notify: Notify; onUseCandidate?: (candidate: CatalogSourceCandidate) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [manifest, setManifest] = useState<{ entries: CatalogSourceManifestEntry[]; summary?: { total: number; bytes: number; byType?: Record<string, number> } } | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [candidates, setCandidates] = useState<CatalogSourceCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const response = await fetch("/api/catalog-sources?limit=12", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { stats?: ImportStats; documents?: SourceDocument[]; candidates?: CatalogSourceCandidate[] };
      setStats(payload.stats ?? null); setDocuments(payload.documents ?? []); setCandidates(payload.candidates ?? []);
    } catch { /* source queue is optional when the current account has no global scope */ }
  };

  const readManifest = async (file: File) => {
    setError("");
    try {
      const payload = JSON.parse(await file.text()) as { entries?: CatalogSourceManifestEntry[]; summary?: { total: number; bytes: number; byType?: Record<string, number> } };
      if (!Array.isArray(payload.entries) || !payload.entries.length) throw new Error("清单中没有可导入的文件");
      if (payload.entries.length > 20000) throw new Error("单次清单最多 20,000 份资料，请拆分后导入");
      setManifest({ entries: payload.entries, summary: payload.summary });
      notify("已读取资料清单，可开始登记 " + payload.entries.length + " 份文件");
    } catch (cause) { setManifest(null); setError(cause instanceof Error ? cause.message : "清单 JSON 无法读取"); }
    finally { if (inputRef.current) inputRef.current.value = ""; }
  };

  const register = async () => {
    if (!manifest || !canWriteGlobal) return;
    setBusy(true); setError("");
    let registered = 0; let candidatesCount = 0; const errors: string[] = [];
    try {
      const chunkSize = 100;
      for (let start = 0; start < manifest.entries.length; start += chunkSize) {
        const entries = manifest.entries.slice(start, start + chunkSize);
        setProgress("正在登记 " + Math.min(start + entries.length, manifest.entries.length) + " / " + manifest.entries.length);
        const response = await fetch("/api/catalog-sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "register_manifest", entries }) });
        const payload = await response.json() as { registered?: number; candidates?: number; errors?: Array<{ message?: string }> };
        if (!response.ok && !payload.registered) throw new Error(payload.errors?.[0]?.message || "资料清单登记失败");
        registered += Number(payload.registered ?? 0); candidatesCount += Number(payload.candidates ?? 0);
        for (const item of payload.errors ?? []) if (item.message) errors.push(item.message);
      }
      setProgress(""); setManifest(null); await load();
      notify("已登记 " + registered + " 份资料，生成 " + candidatesCount + " 条待复核候选" + (errors.length ? "，另有 " + errors.length + " 条失败" : ""));
      if (errors.length) setError(errors.slice(0, 3).join("；"));
    } catch (cause) { setProgress(""); setError(cause instanceof Error ? cause.message : "资料导入失败"); }
    finally { setBusy(false); }
  };

  const review = async (candidateId: string, status: "accepted" | "rejected") => {
    const response = await fetch("/api/catalog-sources", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ candidateId, status }) });
    if (!response.ok) { notify("候选状态更新失败"); return; }
    await load(); notify(status === "accepted" ? "候选已标记为可进入产品录入" : "候选已驳回");
  };

  const typeSummary = useMemo(() => Object.entries(manifest?.summary?.byType ?? {}).map(([type, count]) => (typeLabel[type] || type) + " " + count).join(" · "), [manifest]);

  return <>
    <button className="softButton catalogSourceTrigger" disabled={!canWriteGlobal} title={canWriteGlobal ? "登记材料型录、Catalog 型录和送审图纸清单" : "平台管理员登录后开放"} onClick={() => { setOpen(true); void load(); }}>资料批量导入</button>
    {open && <><div className="overlay catalogSourceOverlay" onClick={() => !busy && setOpen(false)} /><aside className="catalogSourceDrawer">
      <header><div><span>CATALOG SOURCE INGESTION</span><h2>型录资料批量导入</h2><p>先登记全部来源文件，再按解析结果建立可审核的产品候选。</p></div><button disabled={busy} onClick={() => setOpen(false)}>×</button></header>
      <div className="catalogSourceBody">
        <section className="catalogSourceNotice"><b>适用范围</b><p>支持 Catalog 型录、材料图纸送审、PDF/Excel、DWG/PDG/PAG、图片、旧版 Office 与压缩包。图纸和送审文件只进入证据库，不会自动变成合格产品。</p></section>
        <section className="catalogSourceImportCard"><div><b>1. 导入本地扫描清单</b><small>先运行 scripts/build-catalog-source-manifest.mjs，再选择生成的 JSON；不会上传 17GB 原始文件。</small></div><input ref={inputRef} type="file" accept=".json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void readManifest(file); }} /><button className="softButton" onClick={() => inputRef.current?.click()}>选择清单 JSON</button>{manifest && <div className="catalogManifestReady"><b>{manifest.summary?.total ?? manifest.entries.length} 份资料</b><span>{formatBytes(manifest.summary?.bytes ?? manifest.entries.reduce((sum, item) => sum + item.sizeBytes, 0))}</span><small>{typeSummary || "等待分类统计"}</small><button className="primaryButton" disabled={busy} onClick={() => void register()}>{busy ? progress : "登记到资料库"}</button></div>}</section>
        {error && <div className="masterError"><i>!</i><span><b>导入提示</b><small>{error}</small></span></div>}
        <section className="catalogSourceStats"><div><span>已登记资料</span><b>{stats?.total ?? "—"}</b></div><div><span>待解析</span><b>{stats?.queued ?? "—"}</b></div><div><span>待复核候选</span><b>{stats?.candidatesNeedsReview ?? "—"}</b></div></section>
        <section><div className="catalogSourceSectionTitle"><b>最近登记资料</b><button onClick={() => void load()}>刷新</button></div><div className="catalogSourceList">{documents.length ? documents.map((item) => <article key={item.id}><span className={"sourceType " + item.documentType}>{typeLabel[item.documentType] || item.documentType}</span><div><b>{item.fileName}</b><small>{item.manufacturerHint || "未识别厂家"} {item.modelHint ? "· " + item.modelHint : ""} · {formatBytes(item.sizeBytes)}</small><em>{item.extractionStatus}</em></div></article>) : <p className="catalogSourceEmpty">尚未登记资料清单</p>}</div></section>
        <section><div className="catalogSourceSectionTitle"><b>产品候选复核</b><small>候选通过后仍需在“录入产品”中补齐参数、系统适用性、来源页码和审核状态。</small></div><div className="catalogCandidateList">{candidates.length ? candidates.map((item) => <article key={item.id}><div><b>{item.productName || "待命名产品"}</b><small>{item.manufacturer || "未识别厂家"} {item.model ? "· " + item.model : ""} · 置信度 {item.confidence}%</small></div><span>{item.status === "needs_review" ? <><button onClick={() => void review(item.id, "rejected")}>驳回</button><button className="primaryButton" onClick={() => void review(item.id, "accepted")}>通过初筛</button></> : item.status === "accepted" ? <button className="primaryButton" onClick={() => onUseCandidate?.(item)}>带入产品录入</button> : item.status}</span></article>) : <p className="catalogSourceEmpty">暂无候选；厂家多产品型录需先完成 PDF/表格解析。</p>}</div></section>
      </div>
    </aside></>}
  </>;
}
