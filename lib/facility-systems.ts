export type FacilityDomain = {
  id: string;
  name: string;
  en: string;
  scope: string;
  progress: number;
  color: string;
  icon: string;
};

export type FacilitySystem = {
  id: string;
  code: string;
  name: string;
  shortName: string;
  domainId: string;
  dbSystemId: string;
  color: string;
  category: "process" | "utility" | "building" | "safety" | "controls";
};

export const facilityDomains: FacilityDomain[] = [
  { id: "PROC", name: "工艺流体与特气", en: "Process Fluids", scope: "电子特气 VMB · 湿化学品 CDS · 机台二次配", progress: 72, color: "blue", icon: "◇" },
  { id: "UTL", name: "动力公用工程", en: "Utilities", scope: "大宗气体 BSGS · CDA · PCW · 冷冻水 · 电力", progress: 76, color: "green", icon: "⚡" },
  { id: "CR", name: "洁净室与洁净包", en: "Cleanroom Package", scope: "ISO 4/5 · MAU · FFU · HEPA · 压差", progress: 68, color: "cyan", icon: "▦" },
  { id: "WTR", name: "纯水与废水", en: "UPW / Wastewater", scope: "超纯水 UPW · RO · EDI · 回用水 · 酸碱废水", progress: 63, color: "cyan", icon: "≈" },
  { id: "EXH", name: "工艺排风", en: "Process Exhaust", scope: "酸排 · 碱排 · 溶剂排 · Scrubber · 监测", progress: 57, color: "purple", icon: "⌁" },
  { id: "FIRE", name: "消防与生命安全", en: "Fire & Life Safety", scope: "消防水 · 喷淋 · VESDA · F&G · 防火分区", progress: 71, color: "orange", icon: "♢" },
  { id: "CTRL", name: "机电自控与能源管理", en: "MEP / Controls", scope: "BMS · EPMS · SCADA · PLC · I/O · 联锁", progress: 49, color: "gray", icon: "⌘" },
];

export const facilitySystems: FacilitySystem[] = [
  { id: "sys-sgas", code: "SGAS", name: "电子特气 VMB", shortName: "电子特气", domainId: "PROC", dbSystemId: "sys-sgas", color: "blue", category: "process" },
  { id: "sys-cds", code: "CDS", name: "湿化学品 CDS", shortName: "湿化学品", domainId: "PROC", dbSystemId: "sys-cds", color: "purple", category: "process" },
  { id: "sys-hookup", code: "HUP", name: "机台二次配", shortName: "机台二次配", domainId: "PROC", dbSystemId: "sys-hookup", color: "orange", category: "process" },
  { id: "sys-bsgs", code: "BSGS", name: "大宗气体 BSGS", shortName: "大宗气体", domainId: "UTL", dbSystemId: "sys-bsgs", color: "green", category: "utility" },
  { id: "sys-cda", code: "CDA", name: "压缩干燥空气 CDA", shortName: "CDA", domainId: "UTL", dbSystemId: "sys-cda", color: "green", category: "utility" },
  { id: "sys-pcw", code: "PCW", name: "工艺冷却水 PCW", shortName: "PCW", domainId: "UTL", dbSystemId: "sys-pcw", color: "green", category: "utility" },
  { id: "sys-chw", code: "CHW", name: "冷冻水 CHW", shortName: "冷冻水", domainId: "UTL", dbSystemId: "sys-chw", color: "green", category: "utility" },
  { id: "sys-cr", code: "CR", name: "洁净室与洁净包", shortName: "洁净包", domainId: "CR", dbSystemId: "sys-cr", color: "cyan", category: "building" },
  { id: "sys-upw", code: "UPW", name: "超纯水 UPW", shortName: "超纯水", domainId: "WTR", dbSystemId: "sys-upw", color: "cyan", category: "utility" },
  { id: "sys-wwt", code: "WWT", name: "废水处理 WWT", shortName: "废水处理", domainId: "WTR", dbSystemId: "sys-wwt", color: "cyan", category: "utility" },
  { id: "sys-exh", code: "EXH", name: "工艺排风 EXH", shortName: "工艺排风", domainId: "EXH", dbSystemId: "sys-exh", color: "purple", category: "utility" },
  { id: "sys-fire", code: "FIRE", name: "消防与生命安全", shortName: "消防", domainId: "FIRE", dbSystemId: "sys-fire", color: "orange", category: "safety" },
  { id: "sys-ctrl", code: "CTRL", name: "机电自控与能源管理", shortName: "机电自控", domainId: "CTRL", dbSystemId: "sys-ctrl", color: "gray", category: "controls" },
];

export const quickProjectSystems = ["sys-sgas", "sys-bsgs", "sys-cds", "sys-upw"].map((id) => facilitySystems.find((system) => system.id === id)!);

export function getFacilitySystem(idOrName: string) {
  return facilitySystems.find((system) => system.id === idOrName || system.code === idOrName || system.name === idOrName || system.shortName === idOrName);
}

export function facilitySystemClass(idOrName: string) {
  return getFacilitySystem(idOrName)?.color || "gray";
}

export function systemsInDomain(domainId: string) {
  return facilitySystems.filter((system) => system.domainId === domainId);
}
