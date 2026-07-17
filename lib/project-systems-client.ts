import type { FacilitySystem } from "./facility-systems";
import { getCurrentProjectId } from "./project-context";

export type ProjectSystemRecord = {
  id: string;
  projectId: string;
  code: string;
  name: string;
  discipline: string;
  ownerEmail?: string | null;
  designMaturity: number;
  status: string;
};

async function payloadOf(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "项目系统数据操作失败");
  return payload;
}

export async function loadProjectSystems(projectId = getCurrentProjectId()) {
  if (!projectId) throw new Error("请先选择当前项目");
  const response = await fetch(`/api/master-data?entity=systems&projectId=${encodeURIComponent(projectId)}&pageSize=500`, { cache: "no-store" });
  const payload = await payloadOf(response);
  return (payload.data?.systems ?? []) as ProjectSystemRecord[];
}

export async function resolveProjectSystem(catalog: FacilitySystem, createWhenMissing = false) {
  const projectId = getCurrentProjectId();
  const rows = await loadProjectSystems(projectId);
  const existing = rows.find((row) => row.code.toUpperCase() === catalog.code.toUpperCase() || row.id === catalog.id);
  if (existing || !createWhenMissing) return existing ?? null;
  const response = await fetch("/api/master-data", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "systems", data: { projectId, code: catalog.code, name: catalog.name, discipline: catalog.domainId, designMaturity: 0, status: "design" } }),
  });
  const payload = await payloadOf(response);
  return payload.item as ProjectSystemRecord;
}
