export type ProductParameterType = "text" | "number" | "boolean" | "select";

export type ProductParameterDefinition = {
  id?: string;
  categoryId: string;
  key: string;
  label: string;
  groupName: string;
  dataType: ProductParameterType;
  unit?: string | null;
  required: boolean;
  comparable: boolean;
  optionsJson?: string;
  validationJson?: string;
  sortOrder: number;
  helpText?: string;
  status?: string;
};

export type CatalogCategoryTemplate = {
  id: string;
  code: string;
  name: string;
  discipline: string;
  systems: string[];
  icon: string;
  description: string;
  parameters: Omit<ProductParameterDefinition, "categoryId">[];
};

const parameter = (
  key: string,
  label: string,
  groupName: string,
  sortOrder: number,
  dataType: ProductParameterType = "text",
  unit = "",
  required = false,
  options: string[] = [],
  validation: Record<string, number | string> = {},
): Omit<ProductParameterDefinition, "categoryId"> => ({
  key, label, groupName, dataType, unit, required, comparable: true,
  optionsJson: JSON.stringify(options), validationJson: JSON.stringify(validation), sortOrder,
});

const fluidSystems = ["SGAS", "BSGS", "CDS", "HUP", "CDA", "PCW", "CHW", "UPW", "WWT", "EXH", "FIRE"];

/** Initial FAB taxonomy. It is intentionally editable in D1; these templates
 * are only the safe starting point for administrator-managed categories. */
export const catalogCategoryTemplates: CatalogCategoryTemplate[] = [
  {
    id: "cat-regulator", code: "REGULATOR", name: "调压阀 / 背压阀", discipline: "Process / Mechanical", systems: fluidSystems, icon: "◉",
    description: "高纯、特气、化学品及公用工程调压与背压控制。",
    parameters: [
      parameter("regulationType", "调压形式", "性能", 10, "select", "", true, ["single_stage", "dual_stage", "back_pressure", "dome_loaded"]),
      parameter("inletPressureRating", "入口额定压力", "压力与流量", 20, "number", "MPa", true, [], { min: 0 }),
      parameter("outletPressureRange", "出口压力范围", "压力与流量", 30, "text", "MPa", true),
      parameter("cv", "流量系数 Cv", "压力与流量", 40, "number", "Cv", true, [], { min: 0 }),
      parameter("seatMaterial", "阀座材质", "材料与洁净", 50, "text", "", true),
      parameter("internalLeakRate", "内漏率", "泄漏与测试", 60, "text"),
      parameter("externalLeakRate", "外漏率", "泄漏与测试", 70, "text"),
      parameter("proofPressure", "耐压试验压力", "泄漏与测试", 80, "number", "MPa"),
    ],
  },
  {
    id: "cat-diaphragm-valve", code: "DIAPHRAGM_VALVE", name: "隔膜阀", discipline: "Process / Mechanical", systems: fluidSystems, icon: "◒",
    description: "手动或气动高纯隔膜阀、波纹管阀与切断阀。",
    parameters: [
      parameter("actuation", "驱动方式", "执行机构", 10, "select", "", true, ["manual", "normally_closed", "normally_open", "double_acting"]),
      parameter("cv", "流量系数 Cv", "性能", 20, "number", "Cv", true),
      parameter("seatMaterial", "阀座材质", "材料与洁净", 30, "text", "", true),
      parameter("diaphragmMaterial", "隔膜材质", "材料与洁净", 40, "text", "", true),
      parameter("cycleLife", "设计循环寿命", "寿命", 50, "number", "cycles"),
      parameter("actuationPressure", "执行气压力", "执行机构", 60, "text", "MPa"),
      parameter("leakRate", "氦检漏率", "泄漏与测试", 70, "text"),
    ],
  },
  {
    id: "cat-check-bellows", code: "CHECK_BELLOWS_VALVE", name: "止回阀 / 波纹管阀", discipline: "Process / Mechanical", systems: fluidSystems, icon: "⇥",
    description: "止回、单向控制、波纹管密封与安全隔离阀。",
    parameters: [
      parameter("valveType", "阀门形式", "结构", 10, "select", "", true, ["check", "bellows", "needle", "relief"]),
      parameter("crackingPressure", "开启压力", "性能", 20, "text", "bar", true),
      parameter("resealPressure", "回座压力", "性能", 30, "text", "bar"),
      parameter("cv", "流量系数 Cv", "性能", 40, "number", "Cv"),
      parameter("sealMaterial", "密封材质", "材料", 50, "text", "", true),
      parameter("flowDirection", "流向", "结构", 60, "select", "", false, ["unidirectional", "bidirectional"]),
    ],
  },
  {
    id: "cat-fitting-tubing", code: "FITTING_TUBING", name: "管件 / 管材 / 软管", discipline: "Piping", systems: fluidSystems, icon: "⌁",
    description: "VCR/VCO、卡套、焊接、法兰、PFA/PVDF 管件与软管。",
    parameters: [
      parameter("componentType", "部件类型", "分类", 10, "select", "", true, ["tube", "fitting", "gasket", "hose", "flange", "adapter"]),
      parameter("scheduleOrWall", "壁厚 / Schedule", "尺寸", 20, "text"),
      parameter("end1", "端口 1", "接口", 30, "text", "", true),
      parameter("end2", "端口 2", "接口", 40, "text"),
      parameter("gasketMaterial", "垫片材质", "材料", 50, "text"),
      parameter("bendRadius", "最小弯曲半径", "尺寸", 60, "number", "mm"),
      parameter("cleaningSpecification", "清洗包装规范", "洁净", 70, "text"),
    ],
  },
  {
    id: "cat-purifier-filter", code: "GAS_PURIFIER_FILTER", name: "气体净化器 / 过滤器", discipline: "Process", systems: ["SGAS", "BSGS", "HUP", "CDA"], icon: "◈",
    description: "点位及大宗气体净化、颗粒过滤与吸附单元。",
    parameters: [
      parameter("gasFamily", "适用气体族", "应用", 10, "text", "", true),
      parameter("removalContaminants", "去除污染物", "净化性能", 20, "text", "", true),
      parameter("outletPurity", "出口纯度 / 保证值", "净化性能", 30, "text", "ppb/ppt"),
      parameter("filterRating", "过滤精度", "过滤性能", 40, "text", "nm/µm", true),
      parameter("ratedFlow", "额定流量", "流量", 50, "number", "slpm"),
      parameter("pressureDrop", "额定流量压降", "流量", 60, "text", "kPa"),
      parameter("mediaMaterial", "净化 / 滤芯介质", "材料", 70, "text"),
      parameter("serviceLife", "设计寿命 / 容量", "寿命", 80, "text"),
    ],
  },
  {
    id: "cat-pressure-instrument", code: "PRESSURE_INSTRUMENT", name: "压力表 / 压力变送器", discipline: "Instrumentation", systems: fluidSystems, icon: "◎",
    description: "机械压力表、压力变送器、差压变送器与电子压力开关。",
    parameters: [
      parameter("instrumentType", "仪表类型", "分类", 10, "select", "", true, ["gauge", "transmitter", "switch", "differential"]),
      parameter("measuringRange", "量程", "测量", 20, "text", "", true),
      parameter("accuracy", "精度", "测量", 30, "text", "%FS", true),
      parameter("outputSignal", "输出信号", "电气与信号", 40, "text"),
      parameter("processConnection", "过程连接", "接口", 50, "text", "", true),
      parameter("overpressureLimit", "过压能力", "测量", 60, "text"),
      parameter("displayDiameter", "表盘直径", "机械", 70, "number", "mm"),
      parameter("heliumLeakRate", "氦检漏率", "洁净", 80, "text"),
    ],
  },
  {
    id: "cat-flow-temperature", code: "FLOW_TEMPERATURE_INSTRUMENT", name: "流量 / 温度 / 分析仪表", discipline: "Instrumentation", systems: fluidSystems, icon: "∿",
    description: "流量计、温度元件、露点、纯度、pH/电导率及气体分析仪。",
    parameters: [
      parameter("measuredVariable", "测量变量", "测量", 10, "text", "", true),
      parameter("measuringRange", "量程", "测量", 20, "text", "", true),
      parameter("accuracy", "精度", "测量", 30, "text", "", true),
      parameter("outputSignal", "输出 / 通讯", "电气与信号", 40, "text"),
      parameter("responseTime", "响应时间", "性能", 50, "text"),
      parameter("calibration", "校准 / 溯源", "质量", 60, "text"),
    ],
  },
  {
    id: "cat-pump", code: "PUMP", name: "泵", discipline: "Mechanical", systems: ["CDS", "PCW", "CHW", "UPW", "WWT", "EXH", "FIRE"], icon: "◉",
    description: "离心泵、磁力泵、计量泵、真空泵和消防泵。",
    parameters: [
      parameter("pumpType", "泵型", "结构", 10, "text", "", true),
      parameter("ratedFlow", "额定流量", "性能", 20, "number", "m³/h", true),
      parameter("ratedHead", "额定扬程", "性能", 30, "number", "m", true),
      parameter("npshr", "NPSHr", "性能", 40, "number", "m"),
      parameter("efficiency", "效率", "性能", 50, "number", "%"),
      parameter("motorPower", "电机功率", "电机", 60, "number", "kW", true),
      parameter("motorEfficiencyClass", "电机能效等级", "电机", 70, "text"),
      parameter("sealType", "轴封形式", "材料与结构", 80, "text"),
    ],
  },
  {
    id: "cat-compressor", code: "COMPRESSOR_BLOWER", name: "压缩机 / 风机 / 鼓风机", discipline: "Mechanical", systems: ["CDA", "EXH", "CR", "WWT"], icon: "≈",
    description: "空压机、排风机、洁净风机、废水鼓风机与真空机组。",
    parameters: [
      parameter("machineType", "机型", "结构", 10, "text", "", true),
      parameter("ratedFlow", "额定流量", "性能", 20, "number", "m³/h", true),
      parameter("pressureOrStatic", "排压 / 静压", "性能", 30, "text", "kPa", true),
      parameter("motorPower", "电机功率", "电机", 40, "number", "kW", true),
      parameter("noise", "噪声", "环境", 50, "number", "dB(A)"),
      parameter("vibration", "振动等级", "机械", 60, "text"),
    ],
  },
  {
    id: "cat-water-treatment", code: "WATER_TREATMENT", name: "纯废水处理单元", discipline: "Water", systems: ["UPW", "WWT"], icon: "≋",
    description: "RO、EDI、UF、树脂塔、膜组件、加药和废水处理设备。",
    parameters: [
      parameter("processType", "处理工艺", "工艺", 10, "text", "", true),
      parameter("capacity", "处理能力", "工艺", 20, "number", "m³/h", true),
      parameter("recovery", "回收率", "性能", 30, "number", "%"),
      parameter("productQuality", "产水 / 出水指标", "性能", 40, "text", "", true),
      parameter("membraneOrMedia", "膜 / 树脂 / 填料", "材料", 50, "text"),
      parameter("cipRequirement", "CIP 要求", "运维", 60, "text"),
    ],
  },
  {
    id: "cat-cleanroom-hvac", code: "CLEANROOM_HVAC", name: "洁净空调 / 过滤器", discipline: "HVAC / Cleanroom", systems: ["CR"], icon: "▦",
    description: "MAU、AHU、FFU、HEPA/ULPA、风阀和洁净室末端。",
    parameters: [
      parameter("equipmentType", "设备类型", "分类", 10, "text", "", true),
      parameter("airflow", "额定风量", "空气性能", 20, "number", "m³/h", true),
      parameter("externalStaticPressure", "机外静压", "空气性能", 30, "number", "Pa"),
      parameter("filterClass", "过滤等级", "过滤", 40, "text", "", true),
      parameter("initialPressureDrop", "初阻力", "过滤", 50, "number", "Pa"),
      parameter("dimensions", "外形 / 过滤器尺寸", "尺寸", 60, "text", "mm"),
      parameter("fanPower", "风机功率", "电气", 70, "number", "kW"),
      parameter("leakageClass", "泄漏等级", "性能", 80, "text"),
    ],
  },
  {
    id: "cat-exhaust-abatement", code: "EXHAUST_ABATEMENT", name: "工艺排风 / 废气处理", discipline: "Exhaust / Environmental", systems: ["EXH", "HUP"], icon: "↟",
    description: "酸碱/溶剂排风、Local Scrubber、洗涤塔、RTO 与监测单元。",
    parameters: [
      parameter("abatementType", "处理方式", "工艺", 10, "text", "", true),
      parameter("airflow", "处理风量", "性能", 20, "number", "m³/h", true),
      parameter("removalEfficiency", "去除效率", "性能", 30, "text", "%", true),
      parameter("pressureDrop", "系统压降", "性能", 40, "number", "Pa"),
      parameter("constructionMaterial", "壳体 / 风管材质", "材料", 50, "text", "", true),
      parameter("chemicalConsumption", "药剂消耗", "运行", 60, "text"),
    ],
  },
  {
    id: "cat-fire-detector", code: "FIRE_GAS_DETECTOR", name: "火焰 / 气体 / 消防探测", discipline: "Fire & Life Safety", systems: ["FIRE", "SGAS", "CDS", "HUP"], icon: "△",
    description: "火焰、可燃/有毒气体、烟感、VESDA 及消防报警设备。",
    parameters: [
      parameter("detectorType", "探测原理", "探测", 10, "text", "", true),
      parameter("detectionRange", "探测距离 / 量程", "探测", 20, "text", "", true),
      parameter("fieldOfView", "视场角", "探测", 30, "text", "degree"),
      parameter("responseTime", "响应时间", "探测", 40, "text", "s"),
      parameter("analogOutput", "模拟量输出", "接口", 50, "text"),
      parameter("relayOutputs", "继电器输出", "接口", 60, "text"),
      parameter("selfTest", "自检功能", "诊断", 70, "boolean"),
    ],
  },
  {
    id: "cat-hmi-control", code: "HMI_PLC_IO", name: "HMI / PLC / I/O / 控制器", discipline: "Controls", systems: ["CTRL", "SGAS", "CDS", "HUP", "CDA", "PCW", "CHW", "CR", "UPW", "WWT", "EXH", "FIRE"], icon: "▣",
    description: "人机界面、PLC、远程 I/O、控制器与 BMS/SCADA 接口设备。",
    parameters: [
      parameter("deviceType", "设备类型", "分类", 10, "text", "", true),
      parameter("displaySize", "屏幕尺寸", "显示", 20, "number", "inch"),
      parameter("resolution", "分辨率", "显示", 30, "text", "pixel"),
      parameter("displayColors", "显示色数", "显示", 40, "text"),
      parameter("memory", "用户内存", "性能", 50, "text"),
      parameter("interfaces", "物理接口", "通讯", 60, "text", "", true),
      parameter("engineeringSoftware", "组态软件 / 版本", "软件", 70, "text"),
      parameter("mounting", "安装方式", "机械", 80, "text"),
    ],
  },
  {
    id: "cat-electrical", code: "ELECTRICAL_DISTRIBUTION", name: "变配电 / UPS / 配电设备", discipline: "Electrical", systems: ["CTRL", "CR", "UPW", "WWT", "EXH", "FIRE"], icon: "ϟ",
    description: "变压器、开关柜、UPS、PDU、配电箱、电缆和桥架。",
    parameters: [
      parameter("equipmentType", "设备类型", "分类", 10, "text", "", true),
      parameter("ratedVoltage", "额定电压", "电气", 20, "text", "V/kV", true),
      parameter("ratedCurrent", "额定电流", "电气", 30, "number", "A"),
      parameter("ratedPower", "额定容量", "电气", 40, "text", "kVA/MVA"),
      parameter("shortCircuitRating", "短路耐受 / 分断能力", "电气", 50, "text", "kA"),
      parameter("formOfSeparation", "柜内分隔形式", "结构", 60, "text"),
      parameter("energyEfficiency", "能效 / 效率", "性能", 70, "text"),
    ],
  },
  {
    id: "cat-network-fiber", code: "NETWORK_FIBER", name: "工业网络 / 网线 / 光纤", discipline: "Controls / ELV", systems: ["CTRL"], icon: "⌘",
    description: "工业以太网交换机、铜缆、光缆、模块、跳线与协议网关。",
    parameters: [
      parameter("productType", "产品类型", "分类", 10, "text", "", true),
      parameter("networkCategory", "网络类别 / 速率", "网络", 20, "text", "", true),
      parameter("fiberType", "光纤类型", "光学", 30, "text"),
      parameter("coreCount", "芯数 / 对数", "结构", 40, "number"),
      parameter("connectorType", "连接器", "接口", 50, "text"),
      parameter("jacketMaterial", "护套材质 / 阻燃等级", "材料", 60, "text"),
      parameter("transmissionDistance", "传输距离", "网络", 70, "text", "m/km"),
    ],
  },
  {
    id: "cat-terminal", code: "TERMINAL_ACCESSORY", name: "端子 / 隔离器 / 电气附件", discipline: "Electrical / Controls", systems: ["CTRL"], icon: "⊞",
    description: "接线端子、隔离器、安全栅、继电器、电源和浪涌保护。",
    parameters: [
      parameter("connectionTechnology", "接线技术", "结构", 10, "text", "", true),
      parameter("ratedVoltage", "额定电压", "电气", 20, "number", "V", true),
      parameter("ratedCurrent", "额定电流", "电气", 30, "number", "A", true),
      parameter("wireRange", "导线范围", "接线", 40, "text", "mm²/AWG", true),
      parameter("impulseVoltage", "额定冲击耐压", "电气", 50, "number", "kV"),
      parameter("mountingRail", "安装导轨", "机械", 60, "text"),
      parameter("flammability", "阻燃等级", "材料", 70, "text"),
    ],
  },
  {
    id: "cat-warning-light", code: "WARNING_LIGHT", name: "警示灯 / 声光报警", discipline: "Controls / Safety", systems: ["CTRL", "FIRE", "SGAS", "CDS", "HUP"], icon: "◉",
    description: "多层警示灯、蜂鸣器、声光报警器与状态指示。",
    parameters: [
      parameter("lightType", "光源类型", "功能", 10, "text", "", true),
      parameter("tierCount", "层数", "结构", 20, "number", "tier", true, [], { min: 1 }),
      parameter("colors", "灯罩颜色组合", "功能", 30, "text", "", true),
      parameter("buzzer", "蜂鸣器", "功能", 40, "boolean"),
      parameter("mountingType", "安装方式", "机械", 50, "text"),
      parameter("soundLevel", "声压级", "性能", 60, "number", "dB"),
      parameter("flashRate", "闪烁频率", "性能", 70, "text"),
    ],
  },
  {
    id: "cat-chiller-hx", code: "CHILLER_HEAT_EXCHANGER", name: "冷机 / 换热器 / 冷却塔", discipline: "Mechanical", systems: ["CHW", "PCW"], icon: "❄",
    description: "冷水机组、板式换热器、冷却塔和热回收设备。",
    parameters: [
      parameter("equipmentType", "设备类型", "分类", 10, "text", "", true),
      parameter("capacity", "制冷 / 换热能力", "性能", 20, "number", "kW/RT", true),
      parameter("designFlow", "设计流量", "性能", 30, "number", "m³/h"),
      parameter("enteringLeavingTemp", "进出水温度", "性能", 40, "text", "°C", true),
      parameter("cop", "COP / 能效", "性能", 50, "number"),
      parameter("refrigerant", "制冷剂", "工质", 60, "text"),
      parameter("heatTransferMaterial", "换热面材质", "材料", 70, "text"),
    ],
  },
  {
    id: "cat-tank-vessel", code: "TANK_VESSEL_SKID", name: "罐体 / 容器 / Skid", discipline: "Mechanical / Process", systems: fluidSystems, icon: "▱",
    description: "储罐、压力容器、缓冲罐、供应柜和成套 Skid。",
    parameters: [
      parameter("equipmentType", "设备类型", "分类", 10, "text", "", true),
      parameter("volume", "有效容积", "容量", 20, "number", "L/m³", true),
      parameter("designCode", "设计规范", "设计", 30, "text", "", true),
      parameter("shellMaterial", "壳体材质", "材料", 40, "text", "", true),
      parameter("liningMaterial", "内衬材质", "材料", 50, "text"),
      parameter("nozzleSchedule", "接口 / Nozzle 表", "接口", 60, "text"),
      parameter("insulation", "保温 / 伴热", "机械", 70, "text"),
    ],
  },
  {
    id: "cat-general", code: "GENERAL_PRODUCT", name: "其他自定义产品", discipline: "Multi-discipline", systems: ["SGAS", "CDS", "HUP", "BSGS", "CDA", "PCW", "CHW", "CR", "UPW", "WWT", "EXH", "FIRE", "CTRL"], icon: "＋",
    description: "尚未归类的产品；管理员可继续新增专用分类和字段。",
    parameters: [
      parameter("ratedCapacity", "额定能力", "性能", 10, "text"),
      parameter("construction", "结构形式", "结构", 20, "text"),
      parameter("customRequirement", "专用工程参数", "项目要求", 30, "text"),
    ],
  },
];

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

export function validateProductSpecifications(
  specifications: unknown,
  definitions: ProductParameterDefinition[],
) {
  const values = parseObject(specifications);
  const issues: { key: string; label: string; message: string }[] = [];
  for (const definition of definitions.filter((item) => item.status !== "archived")) {
    const value = values[definition.key];
    const empty = value === undefined || value === null || value === "";
    if (definition.required && empty) {
      issues.push({ key: definition.key, label: definition.label, message: `${definition.label}为必填参数` });
      continue;
    }
    if (empty) continue;
    if (definition.dataType === "number" && !Number.isFinite(Number(value))) {
      issues.push({ key: definition.key, label: definition.label, message: `${definition.label}必须是有效数字` });
      continue;
    }
    const validation = parseObject(definition.validationJson);
    const number = Number(value);
    if (definition.dataType === "number" && validation.min !== undefined && number < Number(validation.min)) {
      issues.push({ key: definition.key, label: definition.label, message: `${definition.label}不能小于 ${validation.min}` });
    }
    if (definition.dataType === "number" && validation.max !== undefined && number > Number(validation.max)) {
      issues.push({ key: definition.key, label: definition.label, message: `${definition.label}不能大于 ${validation.max}` });
    }
    if (definition.dataType === "select") {
      const options = JSON.parse(definition.optionsJson || "[]") as string[];
      if (options.length && !options.includes(String(value))) issues.push({ key: definition.key, label: definition.label, message: `${definition.label}不在允许选项内` });
    }
  }
  return { valid: issues.length === 0, issues, values };
}

export function catalogCoverageSummary() {
  const coveredSystems = new Set(catalogCategoryTemplates.flatMap((category) => category.systems));
  const parameterCount = catalogCategoryTemplates.reduce((sum, category) => sum + category.parameters.length, 0);
  return { categoryCount: catalogCategoryTemplates.length, parameterCount, coveredSystems: [...coveredSystems].sort() };
}
