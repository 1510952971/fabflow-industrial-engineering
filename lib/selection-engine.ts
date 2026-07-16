export type RuleResult = {
  ruleCode: string;
  category: "介质" | "材料" | "压力" | "温度" | "接口" | "洁净" | "文件";
  severity: "fatal" | "warning" | "info";
  status: "pass" | "fail" | "warning";
  expected: string;
  actual: string;
  message: string;
};

export type SelectionInput = {
  medium: string;
  selectedMaterialCode: string;
  connectionStandard: string;
  nominalSize: string;
  operatingPressureMpa: number;
  operatingTemperatureC: number;
};

type Component = {
  medium: string;
  allowedMaterialsJson: string;
  requiredFinish: string;
  requiredCleanliness: string;
  designPressureMpa: number;
  designTemperatureC: number;
  connectionStandard: string;
  nominalSize: string;
};

type Material = {
  code: string;
  grade: string;
  surfaceFinish: string;
  cleanlinessGrade: string;
  maxPressureMpa: number;
  minTemperatureC: number;
  maxTemperatureC: number;
  certificationsJson: string;
};

type Compatibility = { rating: string; maxTemperatureC: number | null; notes: string } | null;
type Port = { connectionStandard: string; nominalSize: string; pressureRatingMpa: number; temperatureRatingC: number } | null;

const pass = (ruleCode: string, category: RuleResult["category"], expected: string, actual: string, message: string): RuleResult => ({ ruleCode, category, severity: "info", status: "pass", expected, actual, message });
const fail = (ruleCode: string, category: RuleResult["category"], expected: string, actual: string, message: string): RuleResult => ({ ruleCode, category, severity: "fatal", status: "fail", expected, actual, message });
const warn = (ruleCode: string, category: RuleResult["category"], expected: string, actual: string, message: string): RuleResult => ({ ruleCode, category, severity: "warning", status: "warning", expected, actual, message });

export function validateSelection(input: SelectionInput, component: Component, material: Material, compatibility: Compatibility, port: Port) {
  const results: RuleResult[] = [];
  const allowed = JSON.parse(component.allowedMaterialsJson) as string[];
  results.push(input.medium === component.medium
    ? pass("MEDIUM-001", "介质", component.medium, input.medium, "设备内部介质与设计输入一致")
    : fail("MEDIUM-001", "介质", component.medium, input.medium, "介质与设备部件设计基准不一致"));

  const compatible = allowed.includes(material.grade) && compatibility && compatibility.rating !== "forbidden";
  results.push(compatible
    ? pass("MAT-001", "材料", allowed.join(" / "), material.grade, compatibility?.notes || "材料兼容")
    : fail("MAT-001", "材料", allowed.join(" / "), material.grade, compatibility?.notes || "材料不在批准清单或介质兼容性库中"));

  results.push(material.surfaceFinish === component.requiredFinish
    ? pass("MAT-002", "材料", component.requiredFinish, material.surfaceFinish, "表面处理符合内部洁净要求")
    : fail("MAT-002", "材料", component.requiredFinish, material.surfaceFinish, "表面处理等级不符合设备内部要求"));

  results.push(material.cleanlinessGrade === component.requiredCleanliness
    ? pass("CLEAN-001", "洁净", component.requiredCleanliness, material.cleanlinessGrade, "洁净等级匹配")
    : warn("CLEAN-001", "洁净", component.requiredCleanliness, material.cleanlinessGrade, "洁净等级需由设备厂与业主复核"));

  const pressureLimit = Math.min(material.maxPressureMpa, port?.pressureRatingMpa ?? material.maxPressureMpa);
  const requiredPressure = Math.max(input.operatingPressureMpa, component.designPressureMpa);
  results.push(pressureLimit >= requiredPressure
    ? pass("PRESS-001", "压力", `≥ ${requiredPressure.toFixed(2)} MPa`, `${pressureLimit.toFixed(2)} MPa`, "材料和接口耐压覆盖设计压力")
    : fail("PRESS-001", "压力", `≥ ${requiredPressure.toFixed(2)} MPa`, `${pressureLimit.toFixed(2)} MPa`, "耐压等级不足，禁止发布选型"));

  const tempLimit = Math.min(material.maxTemperatureC, compatibility?.maxTemperatureC ?? material.maxTemperatureC, port?.temperatureRatingC ?? material.maxTemperatureC);
  const requiredTemp = Math.max(input.operatingTemperatureC, component.designTemperatureC);
  results.push(tempLimit >= requiredTemp
    ? (tempLimit - requiredTemp < 15
      ? warn("TEMP-001", "温度", `≥ ${requiredTemp} °C`, `${tempLimit} °C`, "温度裕量小于 15°C，建议复核异常工况")
      : pass("TEMP-001", "温度", `≥ ${requiredTemp} °C`, `${tempLimit} °C`, "温度等级满足并保留合理裕量"))
    : fail("TEMP-001", "温度", `≥ ${requiredTemp} °C`, `${tempLimit} °C`, "温度等级不足"));

  const standardOk = input.connectionStandard === component.connectionStandard && (!port || port.connectionStandard === input.connectionStandard);
  results.push(standardOk
    ? pass("CONN-001", "接口", component.connectionStandard, input.connectionStandard, "连接标准一致")
    : fail("CONN-001", "接口", component.connectionStandard, input.connectionStandard, "连接制式不一致，存在无法对接风险"));

  const sizeOk = input.nominalSize === component.nominalSize && (!port || port.nominalSize === input.nominalSize);
  results.push(sizeOk
    ? pass("CONN-002", "接口", component.nominalSize, input.nominalSize, "公称尺寸匹配")
    : fail("CONN-002", "接口", component.nominalSize, input.nominalSize, "接口尺寸不一致，需要异径或设备厂改口"));

  let certs: string[] = [];
  try { certs = JSON.parse(material.certificationsJson) as string[]; } catch { certs = []; }
  results.push(certs.length >= 2
    ? pass("DOC-001", "文件", "≥ 2 项材料证明", certs.join(" / "), "材料证明文件齐全")
    : warn("DOC-001", "文件", "材质证明 + 清洗/检验报告", certs.join(" / ") || "无", "文件证据不足，审批时必须补齐"));

  const fatalCount = results.filter((r) => r.status === "fail").length;
  const warningCount = results.filter((r) => r.status === "warning").length;
  const score = Math.max(0, 100 - fatalCount * 24 - warningCount * 7);
  return { status: fatalCount ? "blocked" : warningCount ? "attention" : "passed", score, fatalCount, warningCount, results };
}
