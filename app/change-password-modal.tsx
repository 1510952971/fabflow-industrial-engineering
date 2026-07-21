"use client";

import { FormEvent, useState } from "react";

export function ChangePasswordModal({ open, onClose, onSuccess }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = () => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setError(""); onClose(); };
  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (newPassword !== confirmPassword) { setError("两次输入的新密码不一致"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "change_password", currentPassword, newPassword }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "密码修改失败");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setError(""); onSuccess(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "密码修改失败"); }
    finally { setBusy(false); }
  };

  return <div className="authOverlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="authModal" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
      <div className="authBrand"><i/><div><b>FabFlow</b><span>账号安全中心</span></div></div>
      <button className="authClose" onClick={close} aria-label="关闭修改密码窗口">×</button>
      <div className="authHeading"><span>ACCOUNT SECURITY</span><h2 id="change-password-title">修改我的密码</h2><p>必须验证当前密码。修改成功后所有会话失效，请使用新密码重新登录。</p></div>
      <form onSubmit={submit}>
        <label><span>当前密码</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required/></label>
        <label><span>新密码</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 10 位，包含字母和数字" required minLength={10}/></label>
        <label><span>再次输入新密码</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={10}/></label>
        {error && <div className="authError" role="alert">{error}</div>}
        <button className="authSubmit" disabled={busy}>{busy ? "正在修改…" : "修改密码并注销会话"}</button>
      </form>
      <div className="authSecurity"><i>✓</i><span><b>密码不会明文保存</b><small>PBKDF2-SHA-256 · 独立随机盐 · 审计日志</small></span></div>
    </section>
  </div>;
}
