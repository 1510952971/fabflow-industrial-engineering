export const DEFAULT_PROJECT_ID = "";

const moduleSlugs: Record<string, string> = {
  "项目工作台": "home",
  "全球建设管理": "global-fab",
  "工程执行中心": "engineering-execution",
  "计划与供应链": "program-controls",
  "介质参数录入": "media-conditions",
  "结构紧固件计算": "fastener-calculation",
  "管路接头选型": "fitting-selection",
  "厂务大型设备库": "equipment-library",
  "机台二次配批量算量": "tool-hookup",
  "设备工厂协同": "equipment-factory",
  "系统工程域": "system-engineering",
  "合规校验中心": "compliance",
  "工程主数据录入": "master-data",
  "BOM 成本报表": "bom-report",
  "数据底座与协同": "data-foundation",
  "项目档案库": "project-archive",
  "全局工具箱": "toolbox",
};

const slugModules = Object.fromEntries(Object.entries(moduleSlugs).map(([module, slug]) => [slug, module]));

function pathParts() {
  if (typeof window === "undefined") return [];
  return window.location.pathname.split("/").filter(Boolean);
}

export function getCurrentProjectId() {
  if (typeof window === "undefined") return DEFAULT_PROJECT_ID;
  const parts = pathParts();
  if (parts[0] === "projects" && parts[1]) return decodeURIComponent(parts[1]);
  const legacy = new URLSearchParams(window.location.search).get("project");
  return legacy?.trim() || DEFAULT_PROJECT_ID;
}

export function getCurrentModule() {
  if (typeof window === "undefined") return "项目工作台";
  const parts = pathParts();
  if (parts[0] === "projects" && parts[2]) return slugModules[decodeURIComponent(parts[2])] ?? decodeURIComponent(parts[2]);
  return new URLSearchParams(window.location.search).get("module") || "项目工作台";
}

export function updateProjectUrl(projectId: string, module = "项目工作台", replace = false) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (projectId) {
    const slug = moduleSlugs[module] ?? encodeURIComponent(module);
    url.pathname = `/projects/${encodeURIComponent(projectId)}/${slug}`;
  } else {
    url.pathname = "/";
  }
  url.searchParams.delete("project");
  url.searchParams.delete("module");
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
