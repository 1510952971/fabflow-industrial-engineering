"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentProjectId } from "@/lib/project-context";

type Notify = (message: string) => void;
type Provider = { id: string; displayName: string; endpointUrl: string; authType: string; credentialRef: string; callbackSecretRef: string; healthcheckPath: string; enabled: boolean; status: string; lastHealthCheckAt: string | null; lastError: string | null };
type Envelope = { id: string; providerId: string; attachmentId: string; evidenceAttachmentId: string | null; title: string; status: string; externalEnvelopeId: string | null; requestedBy: string; createdAt: string };
type Attachment = { id: string; fileName: string; entityType: string; entityId: string; version: number; status: string };

export function SignatureConsole({ notify }: { notify: Notify }) {
  const projectId = getCurrentProjectId();
  const [providers, setProviders] = useState<Provider[]>([]); const [envelopes, setEnvelopes] = useState<Envelope[]>([]); const [files, setFiles] = useState<Attachment[]>([]);
  const [showProvider, setShowProvider] = useState(false); const [showEnvelope, setShowEnvelope] = useState(false); const [working, setWorking] = useState("");
  const [providerDraft, setProviderDraft] = useState({ displayName: "企业电子签章服务", endpointUrl: "", authType: "bearer", credentialRef: "ESIGN_API_TOKEN", callbackSecretRef: "ESIGN_CALLBACK_SECRET", healthcheckPath: "/health" });
  const [envelopeDraft, setEnvelopeDraft] = useState({ providerId: "", attachmentId: "", title: "设计文件电子签章", signers: "设计负责人,designer@example.com\n审核人,reviewer@example.com" });
  const load = useCallback(async () => {
    const [providerResponse, envelopeResponse, fileResponse] = await Promise.all([
      fetch(`/api/signatures/providers?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" }),
      fetch(`/api/signatures/envelopes?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" }),
      fetch(`/api/files?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" }),
    ]);
    const providerPayload = await providerResponse.json(); const envelopePayload = await envelopeResponse.json(); const filePayload = await fileResponse.json();
    if (providerResponse.ok) setProviders(providerPayload.providers ?? []); if (envelopeResponse.ok) setEnvelopes(envelopePayload.envelopes ?? []); if (fileResponse.ok) setFiles(filePayload.files ?? []);
  }, [projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial API hydration is asynchronous and scoped to the routed project
  useEffect(() => { void load(); }, [load]);

  const saveProvider = async () => {
    setWorking("provider");
    try {
      const response = await fetch("/api/signatures/providers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, providerType: "generic_rest", ...providerDraft }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "签章服务保存失败");
      notify("签章服务配置已保存；请先绑定两个环境密钥，再执行真实检查"); setShowProvider(false); await load();
    } catch (error) { notify(error instanceof Error ? error.message : "签章服务保存失败"); }
    finally { setWorking(""); }
  };
  const providerAction = async (provider: Provider, action: "test" | "enable" | "disable") => {
    setWorking(`${provider.id}:${action}`);
    try {
      const response = await fetch("/api/signatures/providers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: provider.id, action }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "签章服务操作失败");
      notify(action === "test" ? `签章服务真实检查通过（HTTP ${payload.responseCode}）` : `签章服务已${action === "enable" ? "启用" : "停用"}`); await load();
    } catch (error) { notify(error instanceof Error ? error.message : "签章服务操作失败"); }
    finally { setWorking(""); }
  };
  const submitEnvelope = async () => {
    setWorking("envelope");
    try {
      const signers = envelopeDraft.signers.split(/\r?\n/).filter(Boolean).map((line, index) => { const [name, email] = line.split(",").map((value) => value.trim()); return { name, email, order: index + 1 }; });
      const response = await fetch("/api/signatures/envelopes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, providerId: envelopeDraft.providerId, attachmentId: envelopeDraft.attachmentId, title: envelopeDraft.title, signers }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "签章提交失败");
      notify(`签章信封已提交：${payload.envelope.externalEnvelopeId}`); setShowEnvelope(false); await load();
    } catch (error) { notify(error instanceof Error ? error.message : "签章提交失败"); }
    finally { setWorking(""); }
  };
  const enabledProviders = providers.filter((provider) => provider.enabled);

  return <>
    <div className="dataGrid"><section className="card roleBoard"><div className="dataHead"><div><span>E-SIGNATURE PROVIDERS</span><h3>企业电子签章与竣工证据</h3><p>待签原件来自 R2；签章服务使用部署密钥，回调经 HMAC 校验，签后 PDF 重新写入 R2 并记录哈希和审计。</p></div><button onClick={() => setShowProvider(true)}>配置签章服务</button></div><div className="sourceRows">{providers.map((provider) => <div className="sourceRow sourceRowExtended" key={provider.id}><i className={`sourceIcon ${provider.status === "healthy" ? "good" : provider.status === "error" ? "warn" : "idle"}`}>签</i><span><b>{provider.displayName}</b><small>{provider.endpointUrl} · {provider.credentialRef}</small></span><div><em className={`sourceStatus ${provider.status === "healthy" ? "good" : provider.status === "error" ? "warn" : "idle"}`}>{provider.status}</em><small>{provider.lastHealthCheckAt ?? "未检查"}{provider.lastError ? ` · ${provider.lastError}` : ""}</small></div><div className="sourceActions"><button disabled={Boolean(working)} onClick={() => void providerAction(provider, "test")}>实测</button><button disabled={provider.status !== "healthy" || Boolean(working)} onClick={() => void providerAction(provider, provider.enabled ? "disable" : "enable")}>{provider.enabled ? "停用" : "启用"}</button></div></div>)}{!providers.length && <div className="masterEmpty"><b>尚未配置电子签章服务</b><small>需要企业提供服务地址、API 凭据绑定和回调 HMAC 密钥绑定。</small></div>}</div></section><aside className="card approvalBoard"><span>SIGNING ENVELOPES</span><h3>发起签章</h3><p>可用服务 <b>{enabledProviders.length}</b> 个</p><p>可签附件 <b>{files.filter((file) => file.status !== "archived").length}</b> 份</p><p>签章任务 <b>{envelopes.length}</b> 个</p><button className="fullPrimary" disabled={!enabledProviders.length || !files.length} onClick={() => { setEnvelopeDraft({ ...envelopeDraft, providerId: enabledProviders[0]?.id ?? "", attachmentId: files[0]?.id ?? "" }); setShowEnvelope(true); }}>新建签章任务</button></aside><section className="card auditBoard"><div className="dataHead"><div><span>SIGNING EVIDENCE</span><h3>签章任务与回调状态</h3></div></div><div className="auditRows">{envelopes.map((envelope) => <div className="auditRow" key={envelope.id}><code>{envelope.id.slice(0, 8)}</code><span><b>{envelope.title}</b><small>{envelope.requestedBy} · 外部编号 {envelope.externalEnvelopeId ?? "等待返回"}</small></span><time>{envelope.createdAt}</time><em className={["signed", "completed"].includes(envelope.status) ? "good" : envelope.status === "failed" ? "fatal" : "warn"}>{envelope.status}</em>{envelope.evidenceAttachmentId && <a href={`/api/files?projectId=${encodeURIComponent(projectId)}&download=${encodeURIComponent(envelope.evidenceAttachmentId)}`}>下载签后文件</a>}</div>)}{!envelopes.length && <div className="masterEmpty"><b>暂无签章任务</b><small>服务通过检查并启用后，可选择 R2 附件发起签章。</small></div>}</div></section></div>
    {showProvider && <div className="modalShade" role="dialog" aria-modal="true"><section className="card connectorDialog compactDialog"><div className="dataHead"><div><span>E-SIGN PROVIDER</span><h3>配置企业签章服务</h3></div><button onClick={() => setShowProvider(false)}>关闭</button></div><div className="connectorForm"><label><span>服务名称</span><input value={providerDraft.displayName} onChange={(event) => setProviderDraft({ ...providerDraft, displayName: event.target.value })} /></label><label><span>认证方式</span><select value={providerDraft.authType} onChange={(event) => setProviderDraft({ ...providerDraft, authType: event.target.value })}><option value="bearer">Bearer Token</option><option value="api_key">X-API-Key</option><option value="basic">Basic</option></select></label><label className="wide"><span>信封提交 API（接受 multipart/form-data）</span><input value={providerDraft.endpointUrl} onChange={(event) => setProviderDraft({ ...providerDraft, endpointUrl: event.target.value })} placeholder="https://esign.company.com/api/envelopes" /></label><label><span>API 凭据引用</span><input value={providerDraft.credentialRef} onChange={(event) => setProviderDraft({ ...providerDraft, credentialRef: event.target.value.toUpperCase() })} /></label><label><span>回调 HMAC 密钥引用</span><input value={providerDraft.callbackSecretRef} onChange={(event) => setProviderDraft({ ...providerDraft, callbackSecretRef: event.target.value.toUpperCase() })} /></label><label><span>健康检查路径</span><input value={providerDraft.healthcheckPath} onChange={(event) => setProviderDraft({ ...providerDraft, healthcheckPath: event.target.value })} placeholder="/health" /></label></div><div className="dialogActions"><button onClick={() => setShowProvider(false)}>取消</button><button className="primaryButton" disabled={working === "provider"} onClick={() => void saveProvider()}>保存配置</button></div></section></div>}
    {showEnvelope && <div className="modalShade" role="dialog" aria-modal="true"><section className="card connectorDialog compactDialog"><div className="dataHead"><div><span>NEW ENVELOPE</span><h3>发起电子签章</h3></div><button onClick={() => setShowEnvelope(false)}>关闭</button></div><div className="connectorForm"><label><span>签章服务</span><select value={envelopeDraft.providerId} onChange={(event) => setEnvelopeDraft({ ...envelopeDraft, providerId: event.target.value })}>{enabledProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label><label><span>待签附件</span><select value={envelopeDraft.attachmentId} onChange={(event) => setEnvelopeDraft({ ...envelopeDraft, attachmentId: event.target.value })}>{files.filter((file) => file.status !== "archived").map((file) => <option key={file.id} value={file.id}>{file.fileName} · v{file.version}</option>)}</select></label><label className="wide"><span>任务标题</span><input value={envelopeDraft.title} onChange={(event) => setEnvelopeDraft({ ...envelopeDraft, title: event.target.value })} /></label><label className="wide"><span>签署人（每行“姓名,邮箱”，顺序即签署顺序）</span><textarea value={envelopeDraft.signers} onChange={(event) => setEnvelopeDraft({ ...envelopeDraft, signers: event.target.value })} /></label></div><div className="dialogActions"><button onClick={() => setShowEnvelope(false)}>取消</button><button className="primaryButton" disabled={working === "envelope"} onClick={() => void submitEnvelope()}>提交签章</button></div></section></div>}
  </>;
}
