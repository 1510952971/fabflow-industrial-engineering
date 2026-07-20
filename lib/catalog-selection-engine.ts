export type CatalogRequirement = {
  categoryId: string;
  systemCode: string;
  medium?: string | null;
  designPressureMpa?: number | null;
  designTemperatureC?: number | null;
  nominalSize?: string | null;
  connectionStandard?: string | null;
  requiredMaterialsJson?: unknown;
  requiredCertificationsJson?: unknown;
  requiredStandardsJson?: unknown;
  requiredBrandsJson?: unknown;
  requiredSpecificationsJson?: unknown;
};

export type CatalogCandidate = {
  id: string;
  categoryId: string;
  brand: string;
  status: string;
  applicableSystemsJson: unknown;
  mediaJson: unknown;
  minPressureMpa?: number | null;
  maxPressureMpa?: number | null;
  minTemperatureC?: number | null;
  maxTemperatureC?: number | null;
  nominalSize?: string | null;
  connectionStandard?: string | null;
  wettedMaterialsJson?: unknown;
  certificationsJson?: unknown;
  standardsJson?: unknown;
  specificationsJson?: unknown;
};

export type CatalogMatchCheck = {
  code: string;
  label: string;
  status: "pass" | "warning" | "fail";
  expected: string;
  actual: string;
  message: string;
};

export type CatalogMatch = {
  productId: string;
  score: number;
  status: "passed" | "attention" | "blocked";
  checks: CatalogMatchCheck[];
};

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : [];
  } catch {
    return value.split(/[，,;；\n]/).map((item) => item.trim()).filter(Boolean);
  }
}

export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[\s_\-/]+/g, "");
const shown = (value: unknown) => Array.isArray(value) ? value.join("、") : String(value ?? "—");
const containsEquivalent = (actual: string[], expected: string) => actual.some((item) => normalized(item).includes(normalized(expected)) || normalized(expected).includes(normalized(item)));

function check(code: string, label: string, ok: boolean, required: boolean, expected: unknown, actual: unknown, failure: string): CatalogMatchCheck {
  return {
    code,
    label,
    status: ok ? "pass" : required ? "fail" : "warning",
    expected: shown(expected),
    actual: shown(actual),
    message: ok ? `${label}符合` : failure,
  };
}

function evaluateDynamicSpecifications(requirement: Record<string, unknown>, product: Record<string, unknown>) {
  const checks: CatalogMatchCheck[] = [];
  for (const [key, rawRule] of Object.entries(requirement)) {
    const actual = product[key];
    const rule = rawRule && typeof rawRule === "object" && !Array.isArray(rawRule) ? rawRule as Record<string, unknown> : { equals: rawRule };
    const required = rule.required !== false;
    let ok = true;
    const expectedParts: string[] = [];
    if ("equals" in rule) { ok = ok && normalized(actual) === normalized(rule.equals); expectedParts.push(`=${shown(rule.equals)}`); }
    if (Array.isArray(rule.oneOf)) { ok = ok && rule.oneOf.some((item) => normalized(item) === normalized(actual)); expectedParts.push(`可选 ${rule.oneOf.join("/")}`); }
    if (rule.min !== undefined) { ok = ok && Number(actual) >= Number(rule.min); expectedParts.push(`≥${shown(rule.min)}`); }
    if (rule.max !== undefined) { ok = ok && Number(actual) <= Number(rule.max); expectedParts.push(`≤${shown(rule.max)}`); }
    checks.push(check(`spec.${key}`, `规格 ${key}`, ok, required, expectedParts.join(" ") || rawRule, actual, `产品规格 ${key} 不满足技术要求`));
  }
  return checks;
}

export function evaluateCatalogCandidate(requirement: CatalogRequirement, product: CatalogCandidate): CatalogMatch {
  const checks: CatalogMatchCheck[] = [];
  const systems = parseJsonArray(product.applicableSystemsJson);
  const media = parseJsonArray(product.mediaJson);
  const materials = parseJsonArray(product.wettedMaterialsJson);
  const certifications = parseJsonArray(product.certificationsJson);
  const standards = parseJsonArray(product.standardsJson);
  const requiredMaterials = parseJsonArray(requirement.requiredMaterialsJson);
  const requiredCertifications = parseJsonArray(requirement.requiredCertificationsJson);
  const requiredStandards = parseJsonArray(requirement.requiredStandardsJson);
  const requiredBrands = parseJsonArray(requirement.requiredBrandsJson);

  // Empty category means the global matcher is intentionally searching all categories.
  if (requirement.categoryId) {
    checks.push(check("category", "产品分类", product.categoryId === requirement.categoryId, true, requirement.categoryId, product.categoryId, "产品分类与项目需求不一致"));
  }
  checks.push(check("approval", "型录审核状态", ["approved", "conditional"].includes(product.status), true, "approved / conditional", product.status, "产品尚未通过型录审核"));
  checks.push(check("system", "适用系统", !requirement.systemCode || containsEquivalent(systems, requirement.systemCode), true, requirement.systemCode, systems, "产品未批准用于该 FAB 系统"));
  if (requirement.medium) checks.push(check("medium", "介质适用性", media.length > 0 && containsEquivalent(media, requirement.medium), true, requirement.medium, media, "介质不在产品适用范围内"));
  if (requiredBrands.length) checks.push(check("brand", "品牌准入", containsEquivalent(requiredBrands, product.brand), true, requiredBrands, product.brand, "品牌不在项目准入清单内"));

  if (requirement.designPressureMpa !== null && requirement.designPressureMpa !== undefined) {
    const ok = product.maxPressureMpa !== null && product.maxPressureMpa !== undefined
      && Number(product.maxPressureMpa) >= Number(requirement.designPressureMpa)
      && (product.minPressureMpa === null || product.minPressureMpa === undefined || Number(product.minPressureMpa) <= Number(requirement.designPressureMpa));
    checks.push(check("pressure", "设计压力", ok, true, `${requirement.designPressureMpa} MPa`, `${product.minPressureMpa ?? "—"}～${product.maxPressureMpa ?? "—"} MPa`, "产品额定压力范围不足"));
  }
  if (requirement.designTemperatureC !== null && requirement.designTemperatureC !== undefined) {
    const ok = product.maxTemperatureC !== null && product.maxTemperatureC !== undefined
      && Number(product.maxTemperatureC) >= Number(requirement.designTemperatureC)
      && (product.minTemperatureC === null || product.minTemperatureC === undefined || Number(product.minTemperatureC) <= Number(requirement.designTemperatureC));
    checks.push(check("temperature", "设计温度", ok, true, `${requirement.designTemperatureC} °C`, `${product.minTemperatureC ?? "—"}～${product.maxTemperatureC ?? "—"} °C`, "产品额定温度范围不足"));
  }
  if (requirement.nominalSize) { const actual = normalized(product.nominalSize); const expected = normalized(requirement.nominalSize); checks.push(check("size", "公称尺寸", Boolean(actual) && (actual.includes(expected) || expected.includes(actual)), true, requirement.nominalSize, product.nominalSize, "产品尺寸与项目要求不一致")); }
  if (requirement.connectionStandard) { const actual = normalized(product.connectionStandard); const expected = normalized(requirement.connectionStandard); checks.push(check("connection", "接口标准", Boolean(actual) && (actual.includes(expected) || expected.includes(actual)), true, requirement.connectionStandard, product.connectionStandard, "产品接口标准不符合项目要求")); }
  if (requiredMaterials.length) checks.push(check("materials", "接液 / 内部材质", requiredMaterials.every((item) => containsEquivalent(materials, item)), true, requiredMaterials, materials, "产品材质未覆盖全部项目要求"));
  if (requiredCertifications.length) checks.push(check("certifications", "认证", requiredCertifications.every((item) => containsEquivalent(certifications, item)), false, requiredCertifications, certifications, "产品认证资料不完整，需人工确认"));
  if (requiredStandards.length) checks.push(check("standards", "标准", requiredStandards.every((item) => containsEquivalent(standards, item)), false, requiredStandards, standards, "产品符合标准不完整，需人工确认"));
  checks.push(...evaluateDynamicSpecifications(parseJsonObject(requirement.requiredSpecificationsJson), parseJsonObject(product.specificationsJson)));

  const failures = checks.filter((item) => item.status === "fail").length;
  const warnings = checks.filter((item) => item.status === "warning").length;
  const score = Math.max(0, 100 - failures * 25 - warnings * 7);
  return { productId: product.id, score, status: failures ? "blocked" : warnings ? "attention" : "passed", checks };
}

export function matchCatalog(requirement: CatalogRequirement, products: CatalogCandidate[]) {
  const rank = { passed: 0, attention: 1, blocked: 2 } as const;
  return products.map((product) => evaluateCatalogCandidate(requirement, product))
    .sort((a, b) => rank[a.status] - rank[b.status] || b.score - a.score || a.productId.localeCompare(b.productId));
}