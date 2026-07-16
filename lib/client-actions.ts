"use client";

export function downloadText(fileName: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(fileName: string, headers: string[], rows: unknown[][]) {
  const content = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadText(fileName, `\ufeff${content}`, "text/csv;charset=utf-8");
}

export async function copyText(content: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(content);
  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("浏览器未允许复制");
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function openMasterData(entity: string, query = "") {
  window.sessionStorage.setItem("fabflow:master-entity", entity);
  if (query) window.sessionStorage.setItem("fabflow:master-query", query);
  else window.sessionStorage.removeItem("fabflow:master-query");
  window.dispatchEvent(new CustomEvent("fabflow:master-data", { detail: { entity } }));
}

export async function createWorkflowAction(title: string, actionType = "ui_action", payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/workflow-actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "proj-fab2a", actionType, title, payload }),
  });
  const data = await response.json().catch(() => ({})) as { error?: string; action?: { id?: string } };
  if (!response.ok) throw new Error(data.error || "工作流动作保存失败");
  return data.action;
}
