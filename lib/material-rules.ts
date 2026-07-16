export type TechnicalMaterialRule = {
  ruleCode: string;
  serviceName: string;
  mediumCodesJson: string;
  approvalRuleCode?: string | null;
  requiredGrade: string;
  requiredFinish: string;
  fittingStandard: string;
  valveType: string;
  flexibleTubePolicy: string;
  doubleContainment: boolean;
  nominalSizesJson: string;
  restrictions: string;
  sourceDocument: string;
  sourcePages: string;
  sourceClause: string;
};

export type MaterialApprovalRule = {
  ruleCode: string;
  categoryCode: string;
  itemName: string;
  requiredGrade: string;
  allowedBrandsJson: string;
  restrictions: string;
  sourceDocument: string;
  sourcePage: string;
};

export function normalizeMaterialText(value: string) {
  return value.toLowerCase().replace(/[\s()（）\-_/·.]/g, "").replace(/sus|tp/g, "");
}

export function normalizeBrand(value: string) {
  return value.toLowerCase().replace(/[\s()（）\-_/·.]/g, "");
}

export function parseJsonArray(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function findTechnicalRule(medium: string, rules: TechnicalMaterialRule[]) {
  const target = normalizeMaterialText(medium);
  return rules
    .map((rule) => ({ rule, codes: parseJsonArray(rule.mediumCodesJson).map(normalizeMaterialText) }))
    .filter(({ codes }) => codes.includes(target))
    .sort((a, b) => b.codes.length - a.codes.length)[0]?.rule ?? null;
}

export function isBrandApproved(manufacturer: string, rule: MaterialApprovalRule | null) {
  if (!rule) return null;
  const brand = normalizeBrand(manufacturer);
  return parseJsonArray(rule.allowedBrandsJson).some((candidate) => {
    const normalized = normalizeBrand(candidate);
    return brand === normalized || brand.includes(normalized) || normalized.includes(brand);
  });
}
