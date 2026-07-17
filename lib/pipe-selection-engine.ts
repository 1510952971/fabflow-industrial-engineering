export type PipeSelectionBasis = {
  sourceType: "draft" | "tag" | "interface";
  sourceId: string;
  sourceLabel: string;
  systemId: string;
  medium: string;
  designPressureMpa: number;
  designTemperatureC: number;
  connectionStandard: string;
  nominalSize: string;
  cleanlinessGrade: string;
};

export type PipeCatalogItem = {
  id: string;
  name: string;
  systemId: string;
  connection: string;
  material: string;
  pressure: number;
  size: string;
  temp: number;
  cleanliness: string;
  pack: string;
  price: number;
  materialId?: string;
  catalogCode?: string;
  source?: "standard" | "material_master";
};

export type PipeMatchCheck = {
  code: "system" | "pressure" | "temperature" | "connection" | "size" | "cleanliness" | "material";
  label: string;
  status: "pass" | "warning" | "blocked";
  message: string;
};

export type PipeMatchResult = {
  score: number;
  status: "pass" | "warning" | "blocked";
  checks: PipeMatchCheck[];
  blockers: string[];
};

function normalized(value: string) {
  return value.trim().toUpperCase().replace(/[\s“”″'"]/g, "").replace(/DN0+(\d+)/, "DN$1");
}

function cleanlinessLevel(value: string) {
  const key = normalized(value);
  if (key === "UHP") return 5;
  if (key === "UPW") return 4;
  if (key === "HP" || key === "CHEMICAL" || key === "CLEAN") return 3;
  if (key === "FIRE") return 2;
  return 1;
}

function materialCheck(medium: string, material: string): PipeMatchCheck {
  const service = normalized(medium);
  const grade = normalized(material);
  const fluoropolymer = /(PFA|PTFE|PVDF|PP-H|PCTFE)/.test(grade);
  const stainless = /(316L|304L|SS)/.test(grade);
  if (/(HF|氢氟酸)/.test(service) && !fluoropolymer) {
    return { code: "material", label: "介质兼容", status: "blocked", message: `${medium} 不允许直接采用 ${material}，应使用经浓度与温度验证的含氟材料` };
  }
  if (/(HCL|盐酸)/.test(service) && stainless && !fluoropolymer) {
    return { code: "material", label: "介质兼容", status: "blocked", message: `${material} 对 ${medium} 需专项腐蚀评估，当前不能直接放行` };
  }
  if (/(SIH4|PH3|B2H6|CL2|NH3)/.test(service) && !/(316LEP|316L)/.test(grade)) {
    return { code: "material", label: "介质兼容", status: "blocked", message: `${medium} 的高纯/危险气体路径要求 316L EP 或经批准的等效材料` };
  }
  if (/(UPW|超纯水)/.test(service) && !/(PVDF|316LEP|PFA)/.test(grade)) {
    return { code: "material", label: "介质兼容", status: "warning", message: `${material} 需复核 TOC、离子析出与表面处理等级` };
  }
  return { code: "material", label: "介质兼容", status: "pass", message: `${material} 未触发当前介质禁用规则` };
}

export function evaluatePipeSelection(item: PipeCatalogItem, basis: PipeSelectionBasis): PipeMatchResult {
  const checks: PipeMatchCheck[] = [];
  checks.push(item.systemId === basis.systemId
    ? { code: "system", label: "工程系统", status: "pass", message: "与设计输入所属系统一致" }
    : { code: "system", label: "工程系统", status: "blocked", message: "物料所属系统与设计输入不一致" });

  const pressureMargin = item.pressure - basis.designPressureMpa;
  checks.push(pressureMargin < 0
    ? { code: "pressure", label: "压力等级", status: "blocked", message: `额定 ${item.pressure} MPa，低于设计压力 ${basis.designPressureMpa} MPa` }
    : pressureMargin < Math.max(.1, basis.designPressureMpa * .1)
      ? { code: "pressure", label: "压力等级", status: "warning", message: `压力满足但裕量仅 ${pressureMargin.toFixed(2)} MPa` }
      : { code: "pressure", label: "压力等级", status: "pass", message: `额定压力高于设计压力 ${pressureMargin.toFixed(2)} MPa` });

  const temperatureMargin = item.temp - basis.designTemperatureC;
  checks.push(temperatureMargin < 0
    ? { code: "temperature", label: "温度等级", status: "blocked", message: `额定 ${item.temp}°C，低于设计温度 ${basis.designTemperatureC}°C` }
    : temperatureMargin < 10
      ? { code: "temperature", label: "温度等级", status: "warning", message: `温度满足但裕量仅 ${temperatureMargin}°C` }
      : { code: "temperature", label: "温度等级", status: "pass", message: `温度裕量 ${temperatureMargin}°C` });

  checks.push(normalized(item.connection) === normalized(basis.connectionStandard)
    ? { code: "connection", label: "连接标准", status: "pass", message: `${item.connection} 接口一致` }
    : { code: "connection", label: "连接标准", status: "blocked", message: `需要 ${basis.connectionStandard}，候选为 ${item.connection}` });
  checks.push(normalized(item.size) === normalized(basis.nominalSize)
    ? { code: "size", label: "公称尺寸", status: "pass", message: `${item.size} 尺寸一致` }
    : { code: "size", label: "公称尺寸", status: "blocked", message: `需要 ${basis.nominalSize}，候选为 ${item.size}` });

  checks.push(cleanlinessLevel(item.cleanliness) >= cleanlinessLevel(basis.cleanlinessGrade)
    ? { code: "cleanliness", label: "洁净等级", status: "pass", message: `${item.cleanliness} 满足 ${basis.cleanlinessGrade}` }
    : { code: "cleanliness", label: "洁净等级", status: "blocked", message: `${item.cleanliness} 低于要求 ${basis.cleanlinessGrade}` });
  checks.push(materialCheck(basis.medium, item.material));

  const weights = { system: 15, pressure: 20, temperature: 15, connection: 15, size: 10, cleanliness: 10, material: 15 } as const;
  const score = checks.reduce((total, check) => total + (check.status === "pass" ? weights[check.code] : check.status === "warning" ? Math.round(weights[check.code] / 2) : 0), 0);
  const blockers = checks.filter((check) => check.status === "blocked").map((check) => check.message);
  return { score, status: blockers.length ? "blocked" : checks.some((check) => check.status === "warning") ? "warning" : "pass", checks, blockers };
}
