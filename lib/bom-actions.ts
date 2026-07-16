import { getCurrentProjectId } from "./project-context";

export async function createBomRecords(items: Record<string, unknown>[]) {
  const response = await fetch("/api/master-data", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "bomItems",
      items: items.map((item) => ({
        projectId: getCurrentProjectId(),
        quantity: 1,
        unit: "件",
        unitPriceCny: 0,
        wastePct: 5,
        sourceType: "manual",
        status: "draft",
        ...item,
      })),
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "BOM 写入失败");
  return payload.imported as number;
}
