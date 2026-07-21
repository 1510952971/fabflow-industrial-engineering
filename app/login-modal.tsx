"use client";

import { FormEvent, useEffect, useState } from "react";

type SessionPayload = {
  bootstrapRequired: boolean;
  bootstrapEnabled: boolean;
  principal: { displayName: string; email: string; roles: string[]; authenticated: boolean };
  permissions: { canWrite: boolean; canManageRoles: boolean };
};

export function LoginModal({ open, onClose, onSuccess }: {
  open: boolean;
  onClose: () => void;
  onSuccess: (payload: SessionPayload) => void;
}) {
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => {
      setChecking(true);
      setError("");
      return fetch("/api/auth/session", { cache: "no-store" });
    }).then(async (response) => {
        const payload = await response.json() as SessionPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "无法读取登录状态");
        setMode(payload.bootstrapRequired ? "bootstrap" : "login");
        setBootstrapEnabled(payload.bootstrapEnabled);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "无法读取登录状态"))
      .finally(() => setChecking(false));
  }, [open]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: mode, email, password, displayName, bootstrapToken }),
      });
      const payload = await response.json() as SessionPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "登录失败");
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json() as SessionPayload & { error?: string };
      if (!sessionResponse.ok) throw new Error(session.error ?? "登录状态确认失败");
      onSuccess(session);
      setPassword("");
      setBootstrapToken("");
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const unavailable = mode === "bootstrap" && !bootstrapEnabled;
  return <div className="authOverlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="authModal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="authBrand"><i/><div><b>Facility Construction</b><span>Management Software</span></div></div>
      <button className="authClose" onClick={onClose} aria-label="关闭登录窗口">×</button>
      <div className="authHeading">
        <span>{mode === "bootstrap" ? "ADMIN INITIALIZATION" : "SECURE SIGN IN"}</span>
        <h2 id="auth-title">{mode === "bootstrap" ? "初始化系统管理员" : "账号登录"}</h2>
        <p>{mode === "bootstrap" ? "首个账号将获得全局管理员权限，用于创建账号和分配项目角色。" : "登录后按账号的项目角色开放录入、审批与管理功能。"}</p>
      </div>
      {checking ? <div className="authChecking">正在检查账号服务…</div> : unavailable ? <div className="authSetupRequired">
        <b>管理员初始化尚未开放</b>
        <p>请先在部署环境配置 <code>AUTH_BOOTSTRAP_TOKEN</code>，然后刷新此页面。此口令只用于首次初始化，不是管理员密码。</p>
      </div> : <form onSubmit={submit}>
        {mode === "bootstrap" && <label><span>管理员姓名</span><input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：系统管理员" required minLength={2}/></label>}
        <label><span>邮箱账号</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required/></label>
        <label><span>{mode === "bootstrap" ? "设置管理员密码" : "密码"}</span><input type="password" autoComplete={mode === "bootstrap" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 10 位，包含字母和数字" required minLength={10}/></label>
        {mode === "bootstrap" && <label><span>一次性初始化口令</span><input type="password" autoComplete="off" value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value)} placeholder="本机首次运行可留空"/></label>}
        {error && <div className="authError" role="alert">{error}</div>}
        <button className="authSubmit" disabled={loading}>{loading ? "正在验证…" : mode === "bootstrap" ? "创建管理员并登录" : "登录"}</button>
      </form>}
      <div className="authSecurity"><i>✓</i><span><b>服务端权限校验</b><small>密码哈希存储 · HttpOnly 会话 · 项目级 RBAC · 审计日志</small></span></div>
    </section>
  </div>;
}
