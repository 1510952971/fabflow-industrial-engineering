"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type AccessRow = {
  userId: string;
  email: string;
  displayName: string;
  userStatus: string;
  lastSeenAt: string;
  createdAt: string;
  hasPassword: string | null;
  roleId: string | null;
  role: string | null;
  scopeType: string | null;
  scopeId: string | null;
};

const roleLabels: Record<string, string> = {
  platform_admin: "系统管理员",
  project_manager: "项目经理",
  system_owner: "系统负责人",
  equipment_engineer: "设备/材料工程师",
  reviewer: "审核人",
  viewer: "只读用户",
};

export function AccountAdminPanel({ projectId, notify }: { projectId: string; notify: (message: string) => void }) {
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [roles, setRoles] = useState<string[]>(Object.keys(roleLabels));
  const [currentUserId, setCurrentUserId] = useState("");
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ displayName: "", email: "", password: "", role: "equipment_engineer", scopeType: "project" });
  const [grant, setGrant] = useState<Record<string, { role: string; scopeType: string }>>({});
  const [resetUser, setResetUser] = useState<{ id: string; name: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/access?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
    const payload = await response.json() as { users?: AccessRow[]; roles?: string[]; currentUserId?: string; error?: string };
    if (response.status === 401 || response.status === 403) { setAuthorized(false); return; }
    if (!response.ok) throw new Error(payload.error ?? "账号目录读取失败");
    setRows(payload.users ?? []);
    setRoles(payload.roles ?? Object.keys(roleLabels));
    setCurrentUserId(payload.currentUserId ?? "");
    setAuthorized(true);
  }, [projectId]);

  useEffect(() => { queueMicrotask(() => void load().catch((caught) => { setError(caught instanceof Error ? caught.message : "账号目录读取失败"); setAuthorized(false); })); }, [load]);

  const users = useMemo(() => {
    const grouped = new Map<string, { user: AccessRow; assignments: AccessRow[] }>();
    for (const row of rows) {
      const current = grouped.get(row.userId) ?? { user: row, assignments: [] };
      if (row.role) current.assignments.push(row);
      grouped.set(row.userId, current);
    }
    return [...grouped.values()];
  }, [rows]);

  const post = async (body: Record<string, unknown>, success: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "账号操作失败");
      notify(success);
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "账号操作失败");
      return false;
    } finally { setBusy(false); }
  };

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await post({ action: "create_user", ...form, scopeId: form.scopeType === "project" ? projectId : "*" }, "账号已创建并完成角色授权");
    if (ok) setForm({ displayName: "", email: "", password: "", role: "equipment_engineer", scopeType: "project" });
  };

  if (authorized !== true) return null;
  return <section className="card accountAdmin">
    <div className="accountAdminHead"><div><span>ACCOUNT & PROJECT RBAC</span><h3>账号与权限管理</h3><p>管理员创建账号、停用访问、重置密码，并按全局或当前项目授予角色。</p></div><em>{users.length} 个账号</em></div>
    <form className="accountCreate" onSubmit={(event) => void createUser(event)}>
      <label><span>姓名</span><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="工程师姓名" required minLength={2}/></label>
      <label><span>登录邮箱</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@company.com" required/></label>
      <label><span>初始密码</span><input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="至少 10 位，含字母和数字" required minLength={10}/></label>
      <label><span>初始角色</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roles.map((role) => <option key={role} value={role}>{roleLabels[role] ?? role}</option>)}</select></label>
      <label><span>授权范围</span><select value={form.scopeType} disabled={form.role === "platform_admin"} onChange={(event) => setForm({ ...form, scopeType: event.target.value })}><option value="project">当前项目</option><option value="global">全部项目</option></select></label>
      <button disabled={busy}>＋ 创建账号</button>
    </form>
    {error && <div className="accountError" role="alert">{error}</div>}
    <div className="accountRows">{users.map(({ user, assignments }) => {
      const grantValue = grant[user.userId] ?? { role: "viewer", scopeType: "project" };
      return <article key={user.userId} className={user.userStatus === "active" ? "" : "disabled"}>
        <div className="accountIdentity"><i>{user.displayName.slice(0, 2).toUpperCase()}</i><span><b>{user.displayName}</b><small>{user.email} · {user.hasPassword ? "密码账号" : "工作区账号"}</small></span><em>{user.userStatus === "active" ? "有效" : "已停用"}</em></div>
        <div className="accountRoles">{assignments.length ? assignments.map((assignment) => <span key={assignment.roleId ?? `${assignment.role}-${assignment.scopeId}`}><b>{roleLabels[assignment.role ?? ""] ?? assignment.role}</b><small>{assignment.scopeType === "global" ? "全部项目" : assignment.scopeId}</small><button disabled={busy || (user.userId === currentUserId && assignment.role === "platform_admin")} title="移除此角色" onClick={() => void post({ action: "revoke", userId: user.userId, role: assignment.role, scopeType: assignment.scopeType, scopeId: assignment.scopeId }, "角色已移除")}>×</button></span>) : <em>未授权</em>}</div>
        <div className="accountGrant"><select value={grantValue.role} onChange={(event) => setGrant({ ...grant, [user.userId]: { ...grantValue, role: event.target.value } })}>{roles.map((role) => <option key={role} value={role}>{roleLabels[role] ?? role}</option>)}</select><select value={grantValue.scopeType} disabled={grantValue.role === "platform_admin"} onChange={(event) => setGrant({ ...grant, [user.userId]: { ...grantValue, scopeType: event.target.value } })}><option value="project">当前项目</option><option value="global">全部项目</option></select><button disabled={busy} onClick={() => void post({ action: "grant", userId: user.userId, role: grantValue.role, scopeType: grantValue.scopeType, scopeId: grantValue.scopeType === "project" ? projectId : "*" }, "角色已授予")}>授予角色</button></div>
        <div className="accountActions"><button disabled={busy} onClick={() => { setResetUser({ id: user.userId, name: user.displayName }); setResetPassword(""); }}>重置密码</button><button disabled={busy || user.userId === currentUserId} className={user.userStatus === "active" ? "danger" : ""} onClick={() => void post({ action: "set_status", userId: user.userId, status: user.userStatus === "active" ? "disabled" : "active" }, user.userStatus === "active" ? "账号已停用并注销全部会话" : "账号已启用")}>{user.userStatus === "active" ? "停用账号" : "启用账号"}</button></div>
      </article>;
    })}</div>
    {resetUser && <div className="accountReset"><span><b>重置 {resetUser.name} 的密码</b><small>保存后该账号所有登录会话将立即失效。</small></span><input type="password" autoComplete="new-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="新密码，至少 10 位"/><button onClick={async () => { const ok = await post({ action: "reset_password", userId: resetUser.id, password: resetPassword }, "密码已重置，旧会话已注销"); if (ok) { setResetUser(null); setResetPassword(""); } }} disabled={busy || resetPassword.length < 10}>确认重置</button><button onClick={() => setResetUser(null)}>取消</button></div>}
  </section>;
}
