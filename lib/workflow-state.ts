"use client";

import { useEffect, useState } from "react";
import { getCurrentProjectId } from "./project-context";

export type PersistedWorkflowState = {
  id: string;
  entityId: string;
  entityType: string;
  title: string;
  status: string;
  payload: Record<string, unknown>;
};

export function useWorkflowStates(actionType: string) {
  const [states, setStates] = useState<Record<string, PersistedWorkflowState>>({});

  useEffect(() => {
    const projectId = getCurrentProjectId();
    if (!projectId) return;
    const controller = new AbortController();
    void fetch("/api/workflow-actions?projectId=" + encodeURIComponent(projectId) + "&actionType=" + encodeURIComponent(actionType), { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "状态加载失败");
        const next: Record<string, PersistedWorkflowState> = {};
        for (const row of body.actions ?? []) {
          let payload: Record<string, unknown> = {};
          try { payload = JSON.parse(row.payloadJson || "{}"); } catch { payload = {}; }
          next[row.entityId || row.id] = { id: row.id, entityId: row.entityId || row.id, entityType: row.entityType || "workflow_state", title: row.title, status: row.status, payload };
        }
        setStates(next);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setStates({}); })
    return () => controller.abort();
  }, [actionType]);

  const save = async (entityId: string, status: string, payload: Record<string, unknown> = {}, title = entityId, entityType = "workflow_state") => {
    const previous = states[entityId];
    const optimistic: PersistedWorkflowState = { id: previous?.id ?? entityId, entityId, entityType, title, status, payload };
    setStates((current) => ({ ...current, [entityId]: optimistic }));
    const response = await fetch("/api/workflow-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: getCurrentProjectId() || undefined, actionType, entityType, entityId, title, status, payload, upsert: true }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStates((current) => { const next = { ...current }; if (previous) next[entityId] = previous; else delete next[entityId]; return next; });
      throw new Error(body.error || "状态保存失败");
    }
    const row = body.action;
    let savedPayload = payload;
    try { savedPayload = JSON.parse(row.payloadJson || "{}"); } catch { /* keep submitted payload */ }
    setStates((current) => ({ ...current, [entityId]: { id: row.id, entityId: row.entityId || entityId, entityType: row.entityType || entityType, title: row.title, status: row.status, payload: savedPayload } }));
    return row;
  };

  return { states, save, loading: false };
}
