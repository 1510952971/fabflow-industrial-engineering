import type { CatalogSourceManifestEntry } from "./catalog-source-ingestion";

export type ExtractedCatalogProduct = {
  manufacturer: string;
  brand: string;
  productCode: string;
  productName: string;
  model: string;
  series: string;
  categoryId: string;
  systems: string[];
  confidence: number;
  sourceFile: string;
  evidenceType: string;
};

type CategoryRule = { pattern: RegExp; id: string; name: string; systems: string[] };

const categoryRules: CategoryRule[] = [
  { pattern: /diaphragm\s*valve|dia\s*valve|\u9694\u819c\u9600|uhp\s*valve/i, id: "cat-diaphragm-valve", name: "\u9694\u819c\u9600", systems: ["SGAS", "BSGS", "CDS", "HUP"] },
  { pattern: /regulator|back\s*pressure|pressure\s*control|\bpcv\b|tescom|\u8c03\u538b\u9600|\u80cc\u538b\u9600/i, id: "cat-regulator", name: "\u8c03\u538b\u9600 / \u80cc\u538b\u9600", systems: ["SGAS", "BSGS", "CDS", "HUP", "CDA"] },
  { pattern: /check\s*valve|bellow(?:s)?\s*valve|\u6b62\u56de\u9600|\u6ce2\u7eb9\u7ba1\u9600/i, id: "cat-check-bellows", name: "\u6b62\u56de\u9600 / \u6ce2\u7eb9\u7ba1\u9600", systems: ["SGAS", "BSGS", "CDS", "HUP", "CDA", "PCW", "CHW", "UPW"] },
  { pattern: /ball\s*valve|fitting|tub(?:e|ing)|pipe|flange|hose|elbow|t-piece|\u7403\u9600|\u7ba1\u4ef6|\u7ba1\u6750|\u8f6f\u7ba1|\u6cd5\u5170|\u5f2f\u5934/i, id: "cat-fitting-tubing", name: "\u7ba1\u4ef6 / \u7ba1\u6750 / \u9600\u4ef6", systems: ["SGAS", "BSGS", "CDS", "HUP", "CDA", "PCW", "CHW", "UPW", "WWT"] },
  { pattern: /purifier|filter|getter|\u7eaf\u5316\u5668|\u8fc7\u6ee4\u5668/i, id: "cat-purifier-filter", name: "\u51c0\u5316\u5668 / \u8fc7\u6ee4\u5668", systems: ["SGAS", "BSGS", "HUP", "CDA"] },
  { pattern: /pressure\s*(?:gauge|transmitter|sensor)|\bptps\b|(?:^|[-_\s])pt(?:[-_\s]|$)|nagano|wika|wise|\u538b\u529b\u8868|\u538b\u529b\u53d8\u9001\u5668|\u538b\u529b\u4f20\u611f\u5668/i, id: "cat-pressure-instrument", name: "\u538b\u529b\u4eea\u8868", systems: ["SGAS", "BSGS", "CDS", "HUP", "CDA", "PCW", "CHW", "UPW", "WWT"] },
  { pattern: /flow\s*(?:meter|switch|controller)|temperature|therm|analy[sz]er|\bmfc\b|\befs\b|ap74|\u8fc7\u6d41\u5f00\u5173|\u6d41\u91cf|\u6e29\u5ea6|\u5206\u6790\u4eea/i, id: "cat-flow-temperature", name: "\u6d41\u91cf / \u6e29\u5ea6 / \u5206\u6790\u4eea\u8868", systems: ["SGAS", "BSGS", "CDS", "HUP", "CDA", "PCW", "CHW", "UPW", "WWT"] },
  { pattern: /detector|fire\s*sensor|flame|gasdet|uvir|uv-ir|\bfsl[-_]?\d|\bmidas\b|\bdcr1\b|\u4fa6\u6d4b\u5668|\u63a2\u6d4b\u5668|\u706b\u7130|\u6c14\u4f53\u68c0\u6d4b/i, id: "cat-fire-detector", name: "\u706b\u7130 / \u6c14\u4f53\u63a2\u6d4b\u5668", systems: ["FIRE", "SGAS", "CDS", "HUP"] },
  { pattern: /scrubber|abatement|exhaust|\u6d17\u6da4\u5854|\u5e9f\u6c14|\u6392\u98ce/i, id: "cat-exhaust-abatement", name: "\u5de5\u827a\u6392\u98ce / \u5e9f\u6c14\u5904\u7406", systems: ["EXH", "HUP"] },
  { pattern: /compressor|blower|dryer|air\s*separator|\u538b\u7f29\u673a|\u9f13\u98ce\u673a|\u5e72\u71e5\u673a|\u7a7a\u5206/i, id: "cat-compressor", name: "\u538b\u7f29\u673a / \u98ce\u673a / \u5e72\u71e5\u673a", systems: ["CDA", "EXH", "CR", "WWT"] },
  { pattern: /\bpump\b|vacuum\s*pump|\u6cf5|\u771f\u7a7a\u6cf5/i, id: "cat-pump", name: "\u6cf5", systems: ["CDS", "PCW", "CHW", "UPW", "WWT", "EXH", "FIRE"] },
  { pattern: /clean\s*room|hepa|\bffu\b|hvac|\u6d01\u51c0|\u9ad8\u6548\u8fc7\u6ee4/i, id: "cat-cleanroom-hvac", name: "\u6d01\u51c0\u7a7a\u8c03 / \u8fc7\u6ee4\u5668", systems: ["CR"] },
  { pattern: /chiller|heat\s*exchanger|cooling\s*tower|\u51b7\u673a|\u6362\u70ed\u5668|\u51b7\u5374\u5854/i, id: "cat-chiller-hx", name: "\u51b7\u673a / \u6362\u70ed\u5668 / \u51b7\u5374\u5854", systems: ["CHW", "PCW"] },
  { pattern: /\bplc\b|\bhmi\b|\brio\b|i\/o|controller|\u63a7\u5236\u5668|\u81ea\u63a7/i, id: "cat-hmi-control", name: "HMI / PLC / I/O / \u63a7\u5236\u5668", systems: ["CTRL"] },
  { pattern: /network|fiber|ethernet|\u7f51\u7ebf|\u5149\u7ea4|\u5de5\u4e1a\u7f51\u7edc/i, id: "cat-network-fiber", name: "\u5de5\u4e1a\u7f51\u7edc / \u5149\u7ea4", systems: ["CTRL"] },
  { pattern: /\bups\b|electrical|distribution|switchgear|\u914d\u7535|\u7535\u6c14|\u76d8\u67dc|\u7535\u7f06|\u6865\u67b6/i, id: "cat-electrical", name: "\u53d8\u914d\u7535 / UPS / \u914d\u7535\u8bbe\u5907", systems: ["CTRL", "CR", "UPW", "WWT", "EXH", "FIRE"] },
  { pattern: /warning\s*light|alarm|\u8b66\u793a\u706f|\u58f0\u5149\u62a5\u8b66/i, id: "cat-warning-light", name: "\u8b66\u793a\u706f / \u58f0\u5149\u62a5\u8b66", systems: ["CTRL", "FIRE", "SGAS", "CDS", "HUP"] },
  { pattern: /terminal|isolator|\u7aef\u5b50|\u9694\u79bb\u5668/i, id: "cat-terminal", name: "\u7aef\u5b50 / \u9694\u79bb\u5668 / \u7535\u6c14\u9644\u4ef6", systems: ["CTRL"] },
  { pattern: /upw|water\s*treatment|waste\s*water|\u7eaf\u6c34|\u8d85\u7eaf\u6c34|\u5e9f\u6c34/i, id: "cat-water-treatment", name: "\u7eaf\u5e9f\u6c34\u5904\u7406\u5355\u5143", systems: ["UPW", "WWT"] },
  { pattern: /tank|vessel|skid|cabinet|\bvmb\b|\bvmp\b|\bvdb\b|\bgms\b|\bgds\b|\u7f50\u4f53|\u5bb9\u5668|\u6c14\u67dc|\u76d8\u9762/i, id: "cat-tank-vessel", name: "\u7f50\u4f53 / \u5bb9\u5668 / Skid", systems: ["SGAS", "BSGS", "CDS", "HUP", "CDA", "PCW", "CHW", "UPW", "WWT"] },
];

const brandAliases: Array<[RegExp, string]> = [
  [/AP\s*TECH/i, "APTech"], [/HONEYWELL|HONYWELL/i, "Honeywell"], [/SENSE\s*-?\s*WARE/i, "Sense-WARE"], [/SWAGELOK/i, "Swagelok"],
  [/FUJIKIN/i, "Fujikin"], [/HAM\s*-?\s*LET|HAMLET/i, "HAM-LET"], [/DOCKWEI(?:L|LI)ER/i, "Dockweiler"], [/VALEX/i, "Valex"],
  [/TESCOM/i, "Tescom"], [/CARTEN/i, "Carten"], [/ROTAREX/i, "Rotarex"], [/CONCOA/i, "CONCOA"], [/PARKER/i, "Parker"],
  [/\bPALL\b/i, "Pall"], [/ENTEGRIS/i, "Entegris"], [/\bMKS\b/i, "MKS"], [/\bVAT\b/i, "VAT"], [/BROOKS/i, "Brooks"],
  [/SIEMENS/i, "Siemens"], [/SCHNEIDER/i, "Schneider Electric"], [/ROCKWELL|ALLEN\s*-?\s*BRADLEY/i, "Rockwell Automation"],
  [/EMERSON/i, "Emerson"], [/FESTO/i, "Festo"], [/BURKERT|B[\u00dcU]RKERT/i, "B\u00fcrkert"], [/\bSMC\b/i, "SMC"], [/\bCKD\b/i, "CKD"],
  [/\bASCO\b/i, "ASCO"], [/OHNO/i, "OHNO"], [/IHARA/i, "IHARA"], [/\bKITZ\b/i, "KITZ"], [/DRAEGER|DRAGER/i, "Dr\u00e4ger"],
  [/RIKEN\s*KEIKI/i, "RIKEN KEIKI"], [/BESTOUCH/i, "Bestouch"], [/SHARPEYE/i, "SharpEye"], [/\bSAES\b/i, "SAES"],
  [/AERONEX/i, "Aeronex"], [/JOHNSON\s*&?\s*MATTHEY/i, "Johnson Matthey"], [/SUPERLOK/i, "SUPERLOK"], [/MASTELOK|MASTERLOK/i, "MasterLok"],
  [/GENTEC/i, "GENTEC"], [/\bGCE\b/i, "GCE"], [/SEVEN\s*STAR/i, "Sevenstar"], [/ADVANCE/i, "Advance"], [/BRIGHTY/i, "Brighty"],
  [/NAGANO/i, "Nagano"], [/\bMOTT\b/i, "Mott"], [/\bMIDAS\b/i, "Honeywell"], [/PROFACE/i, "Pro-face"], [/SIERRA/i, "Sierra Monitor"],
  [/DWYER/i, "Dwyer"], [/\bWISE\b/i, "WISE"], [/\bWIKA\b/i, "WIKA"], [/AGILENT|HLD[_\s-]*MD30/i, "Agilent"], [/\bCROWN\b/i, "Crown"],
  [/\b6(?:ES|GK|AV)\d/i, "Siemens"],
];

const catalogCategoryFolders = /^(catalog\s*\u578b\u5f55|ball\s*valve|bellow\s*valve|check\s*valve|diaphragm\s*valve|detector|filter|firesensor|fitting|flange|flow\s*meter|pipe|pump|purifier|regulator|ups|\u7535\u63a7|\u7a7a\u538b\u673a|\u7a7a\u5206\u8d44\u6599)$/i;
const supportedProductExtensions = new Set([".pdf", ".xls", ".xlsx", ".csv", ".tsv", ".jpg", ".jpeg", ".png", ".tif", ".tiff"]);
const nonProductName = /(?:\u9001\u5ba1\u6e05\u5355|\u8fdb\u5ea6\u8ddf\u8e2a|\u9879\u6b21\u8868|\u54c1\u724c\u8868|\u62a5\u5ba1\u54c1\u724c\u578b\u53f7\u53c2\u6570|\u6295\u6807\u987b\u77e5|\u5408\u540c|\u62a5\u4ef7|\u4ef7\u683c|\u91c7\u8d2d|\u4e1a\u7ee9|\u516c\u53f8\u7b80\u4ecb|\u4f01\u4e1a\u4ecb\u7ecd|\u8bc1\u4e66|\u5408\u683c\u8bc1|\u68c0\u6d4b\u62a5\u544a|\u5b89\u88c5\u8bb0\u5f55|\u57f9\u8bad|\u4fdd\u9669|\u5dee\u65c5|\u62a5\u9500|\u8054\u52a8\u903b\u8f91|\u70b9\u4f4d\u8ba1\u7b97|\u4e00\u822c\u56fe\u4f8b|\u7f29\u5199\u5bf9\u7167|\u7535\u529b\u67b6\u6784|\u7f51\u7edc\u67b6\u6784|\u7535\u76d8\u56fe|quotation|price\s*list|contract|invoice|expense|reimbursement|taxi|travel|insurance|training|presentation|application\s*overview|site\s*plan|layout|\bp\s*&?\s*id\b|\bpfd\b)/i;
const nonProductPath = /(?:\u8ba4\u8bc1\u53ca\u68c0\u6d4b\u62a5\u544a|\u4e1a\u7ee9\u8bc1\u660e|\u516c\u53f8\u8d44\u8d28|\u4f01\u4e1a\u8d44\u8d28|\u5408\u683c\u8bc1|certificates?|approvals?)/i;
const drawingCode = /\b(?:GMS|GDS|VMB|VMP|VDB|SG)-(?:LAY|SCH|DET|PID|PFD|ARCH|GNT)-/i;
const documentToken = /BROCHURE|DATA[-_]?SHEET|CERT|REPORT|DRAWING|INSTALLATION|APPLICATION|EXPIRE|ISO\d|JIS|SCADA|DOCX|PROFINET/i;
const monthToken = /JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER/i;

function fileStem(path: string) {
  return (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "").replace(/^\s*\d+(?:[-._]\d+)*[\s\u3001._-]+/, "").replace(/\s*\(\d+\)\s*$/, "").trim();
}

export function inferCatalogCategory(path: string) {
  return categoryRules.find((rule) => rule.pattern.test(path)) ?? { id: "cat-general", name: "\u5176\u4ed6\u81ea\u5b9a\u4e49\u4ea7\u54c1", systems: ["SGAS", "CDS", "HUP", "BSGS", "CDA", "PCW", "CHW", "CR", "UPW", "WWT", "EXH", "FIRE", "CTRL"], pattern: /(?:)/ };
}

export function inferCatalogBrand(entry: CatalogSourceManifestEntry) {
  const path = entry.relativePath;
  const alias = brandAliases.find(([pattern]) => pattern.test(path));
  if (alias) return alias[1];
  if (entry.manufacturerHint) return entry.manufacturerHint;
  const segments = path.split("/").filter(Boolean);
  const catalogIndex = segments.findLastIndex((part) => /^catalog\s*\u578b\u5f55$/i.test(part));
  if (catalogIndex >= 0) {
    const first = segments[catalogIndex + 1];
    const second = segments[catalogIndex + 2];
    const inferred = first && catalogCategoryFolders.test(first) ? second : first;
    if (inferred && !catalogCategoryFolders.test(inferred) && inferred.length <= 50) return inferred.replace(/\s*\u6837\u672c$/i, "").trim();
  }
  return "\u5f85\u8bc6\u522b\u5382\u5546";
}

export function isProductBearingCatalogSource(entry: CatalogSourceManifestEntry) {
  if (!supportedProductExtensions.has(entry.extension.toLowerCase())) return false;
  if (/(?:^|\/)\._DAV(?:\/|$)|(?:^|\/)\._|(?:^|\/)_notes(?:\/|$)/i.test(entry.relativePath)) return false;
  if (entry.documentType === "equipment_drawing" || entry.documentType === "control_io_drawing") return false;
  const stem = fileStem(entry.relativePath);
  if (drawingCode.test(stem) || nonProductName.test(entry.relativePath) || nonProductPath.test(entry.relativePath)) return false;
  return true;
}

function expandJoinedModels(token: string) {
  const parts = token.toUpperCase().split("&").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return parts;
  const first = parts[0];
  const prefix = first.match(/^[A-Z]+/)?.[0] ?? "";
  return parts.map((part, index) => index === 0 || /^[A-Z]/.test(part) ? part : prefix + part);
}

function normalizeModelToken(value: string) {
  return value.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi, "").replace(/\.{2,}/g, ".").toUpperCase();
}

export function extractModelCodes(relativePath: string) {
  const stem = fileStem(relativePath).replace(/[\u3000]/g, " ");
  const upper = stem.toUpperCase();
  const found: string[] = [];
  for (const match of upper.matchAll(/\b(\d{2,4})\s+SERIES\b/g)) found.push(match[1] + " SERIES");
  for (const match of upper.matchAll(/\b(?=[A-Z0-9][A-Z0-9&.\/-]{2,}\b)(?=[A-Z0-9&.\/-]*[A-Z])(?=[A-Z0-9&.\/-]*\d)[A-Z0-9][A-Z0-9&.\/-]{2,}\b/g)) {
    let token = normalizeModelToken(match[0]);
    if (!token || token.length > 48 || monthToken.test(token) || documentToken.test(token) || /^(?:20\d{2}|19\d{2})$/.test(token)) continue;
    if (/^(?:(?:FV|MV|TW|PW|PWE|PWK|PWD|PS|DN|PN|CB)\d{1,3}|\d+(?:PW|PWE|PWK|PWD|PL|T))$/i.test(token)) continue;
    if (/^(?:V\d+(?:-\d+)*|R\d+|REV\d+|FAB\d+|CO2|NH3|H2O|DC\d+V|RS\d+|\d+(?:PSI|LBS)|\d+-\d+MA)$/.test(token)) continue;
    if (drawingCode.test(token)) continue;
    token = token.replace(/^(?:APTECH|HONEYWELL|FUJIKIN|TESCOM|SIEMENS)[-_]/, "");
    for (const expanded of expandJoinedModels(token)) if (expanded.length >= 3) found.push(expanded);
  }
  return [...new Set(found)].filter((value) => !/^\d+(?:\.\d+)+$/.test(value));
}

function submittedConfigurationCode(relativePath: string, model: string) {
  if (!/\u6750\u6599\u56fe\u7eb8\u9001\u5ba1/i.test(relativePath)) return model;
  const stem = fileStem(relativePath).toUpperCase().replace(/[()]/g, " ");
  const at = stem.indexOf(model);
  if (at < 0) return model;
  const tail = stem.slice(at).replace(/[^A-Z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (documentToken.test(tail) || nonProductName.test(tail)) return model;
  return tail.length >= model.length && tail.length <= 96 ? tail : model;
}

export function extractCatalogProductsFromSource(entry: CatalogSourceManifestEntry): ExtractedCatalogProduct[] {
  if (!isProductBearingCatalogSource(entry)) return [];
  const category = inferCatalogCategory(entry.relativePath);
  const brand = inferCatalogBrand(entry);
  const models = extractModelCodes(entry.relativePath);
  return models.map((model) => {
    const productCode = submittedConfigurationCode(entry.relativePath, model);
    const confidence = Math.min(95, 55 + (brand !== "\u5f85\u8bc6\u522b\u5382\u5546" ? 15 : 0) + (category.id !== "cat-general" ? 15 : 0) + (productCode !== model ? 5 : 0));
    return { manufacturer: brand, brand, productCode, productName: category.name, model, series: model.replace(/[-_/].*$/, ""), categoryId: category.id, systems: category.systems, confidence, sourceFile: entry.relativePath, evidenceType: entry.documentType };
  });
}

export function catalogProductIdentity(product: Pick<ExtractedCatalogProduct, "brand" | "productCode">) {
  return product.brand.trim().toUpperCase().replace(/\s+/g, " ") + "|" + product.productCode.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}
