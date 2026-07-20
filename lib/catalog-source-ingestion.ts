export type CatalogDocumentType = "manufacturer_catalog" | "product_datasheet" | "submittal_package" | "parameter_sheet" | "bom_spreadsheet" | "equipment_drawing" | "control_io_drawing" | "product_image" | "certificate_manual" | "archive" | "other";
export type CatalogParserType = "pdf_text" | "xlsx_table" | "legacy_office" | "cad_attachment" | "image_attachment" | "archive_manifest" | "manual_review";
export type CatalogSourceManifestEntry = {
  sourceKey: string; sourceRoot: string; relativePath: string; fileName: string; extension: string; contentType: string; sizeBytes: number; modifiedAt?: string;
  documentType: CatalogDocumentType; parserType: CatalogParserType; manufacturerHint: string; productFamilyHint: string; modelHint: string; sourceRevision?: string;
};
const brandTokens = ["APTECH", "HONEYWELL", "ASCO", "FUJIKIN", "HAM-LET", "SWAGELOK", "DK-LOK", "DOCKWEILER", "VALEX", "KITZ", "SMC", "PARKER", "ENTEGRIS", "MKS", "VAT", "BROOKS", "TESCOM", "TAIYO", "CKD", "BURKERT", "FESTO", "SPIRAX", "WIKA", "ENDRESS", "SIEMENS", "SCHNEIDER", "ROCKWELL", "EMERSON", "DUPONT"];
const familyTokens: Array<[RegExp, string]> = [
  [/diaphragm\s*valve|\u9694\u819c\u9600/i, "diaphragm valve"], [/ball\s*valve|\u7403\u9600/i, "ball valve"], [/regulator|pressure\s*regulator|\u8c03\u538b\u9600/i, "pressure regulator"],
  [/check\s*valve|\u6b62\u56de\u9600/i, "check valve"], [/flow\s*switch|\u6d41\u91cf\u5f00\u5173/i, "flow switch"], [/mass\s*flow|MFC|\u8d28\u91cf\u6d41\u91cf/i, "mass flow controller"],
  [/scrubber|\u6d17\u6da4\u5854|\u5c3e\u6c14\u5904\u7406/i, "scrubber"], [/compressor|\u538b\u7f29\u673a/i, "compressor"], [/pump|\u6cf5/i, "pump"],
  [/panel|VMB|VMP|GMS|GDS|\u6c14\u4f53\u9762\u677f|\u6c14\u67dc/i, "gas panel/cabinet"], [/PLC|RIO|I\/O|\u81ea\u63a7|control/i, "control and I/O"],
  [/UPW|\u7eaf\u6c34|\u8d85\u7eaf\u6c34/i, "UPW equipment"], [/waste\s*water|\u5e9f\u6c34/i, "waste water"], [/fire|\u6d88\u9632|flame|\u706b\u7130/i, "fire equipment"],
];
const extOf = (path: string) => { const match = path.toLowerCase().match(/\.([a-z0-9]+)$/); return match ? "." + match[1] : ""; };
const mimeByExtension: Record<string, string> = {
  ".pdf": "application/pdf", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv", ".tsv": "text/tab-separated-values", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".ppt": "application/vnd.ms-powerpoint",
  ".dwg": "image/vnd.dwg", ".dxf": "image/vnd.dxf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".tif": "image/tiff", ".tiff": "image/tiff", ".webp": "image/webp", ".zip": "application/zip",
  ".7z": "application/x-7z-compressed", ".rar": "application/vnd.rar", ".txt": "text/plain", ".html": "text/html", ".htm": "text/html",
};
const clean = (value: string) => value.split(String.fromCharCode(92)).join("/").replaceAll("//", "/").replace(/^\.\//, "").trim();
export function classifyCatalogSource(relativePath: string, extension = extOf(relativePath)): { documentType: CatalogDocumentType; parserType: CatalogParserType } {
  const path = relativePath.toLowerCase(); const ext = extension.toLowerCase();
  if ([".zip", ".7z", ".rar", ".gz", ".tar"].includes(ext)) return { documentType: "archive", parserType: "archive_manifest" };
  if ([".dwg", ".dxf", ".pdg", ".pag", ".dir", ".dwl", ".dwl2"].includes(ext)) return { documentType: /plc|rio|i\/o|control|electrical|instrument/.test(path) ? "control_io_drawing" : "equipment_drawing", parserType: "cad_attachment" };
  if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tif", ".tiff", ".webp"].includes(ext)) return { documentType: "product_image", parserType: "image_attachment" };
  if ([".xlsx", ".xls", ".csv", ".tsv"].includes(ext)) return { documentType: /bom|list|material|purchase|\u6e05\u5355|\u7269\u6599|\u91c7\u8d2d/.test(path) ? "bom_spreadsheet" : "parameter_sheet", parserType: "xlsx_table" };
  if ([".doc", ".docx", ".ppt", ".pptx", ".txt", ".html", ".htm"].includes(ext)) return { documentType: /manual|certificate|\u8bf4\u660e\u4e66|\u8bc1\u4e66|\u5408\u683c/.test(path) ? "certificate_manual" : "submittal_package", parserType: "legacy_office" };
  if (ext === ".pdf") {
    if (/submittal|drawing|\u9001\u5ba1|\u62a5\u5ba1|\u56fe\u7eb8/.test(path)) return { documentType: "submittal_package", parserType: "pdf_text" };
    if (/catalog|datasheet|technical|\u4ea7\u54c1\u578b\u5f55|\u89c4\u683c|\u53c2\u6570|\u4ea7\u54c1/.test(path)) return { documentType: /catalog|\u4ea7\u54c1\u578b\u5f55/.test(path) ? "manufacturer_catalog" : "product_datasheet", parserType: "pdf_text" };
    return { documentType: "product_datasheet", parserType: "pdf_text" };
  }
  return { documentType: "other", parserType: "manual_review" };
}
export function inferCatalogHints(relativePath: string): Pick<CatalogSourceManifestEntry, "manufacturerHint" | "productFamilyHint" | "modelHint"> {
  const normalized = clean(relativePath); const upper = normalized.toUpperCase(); const manufacturer = brandTokens.find((token) => upper.includes(token)) ?? "";
  const family = familyTokens.find(([pattern]) => pattern.test(normalized))?.[1] ?? ""; const fileName = normalized.split("/").pop() ?? normalized;
  const models = fileName.match(/\b(?:AP|MFC|MKS|VAT|FSL|UV|UVIR|SM|FV|MV|VMB|VMP|GMS|GDS|WB|UPW|PLC|RIO)[A-Z0-9\-\/]{2,}\b/gi) ?? [];
  return { manufacturerHint: manufacturer, productFamilyHint: family, modelHint: models.sort((a, b) => b.length - a.length)[0] ?? "" };
}
export function createCatalogSourceManifestEntry(input: { root: string; relativePath: string; sizeBytes: number; modifiedAt?: string; contentType?: string }): CatalogSourceManifestEntry {
  const relativePath = clean(input.relativePath); const extension = extOf(relativePath); const kind = classifyCatalogSource(relativePath, extension); const hints = inferCatalogHints(relativePath);
  const fileName = relativePath.split("/").pop() ?? relativePath; const sourceRoot = clean(input.root);
  return { sourceKey: [sourceRoot, relativePath].join("|"), sourceRoot, relativePath, fileName, extension, contentType: input.contentType || mimeByExtension[extension] || "application/octet-stream", sizeBytes: Math.max(0, Math.round(input.sizeBytes)), modifiedAt: input.modifiedAt, ...kind, ...hints };
}
export function summarizeCatalogSources(entries: CatalogSourceManifestEntry[]) {
  const byType = Object.fromEntries([...new Set(entries.map((entry) => entry.documentType))].map((type) => [type, entries.filter((entry) => entry.documentType === type).length]));
  const byParser = Object.fromEntries([...new Set(entries.map((entry) => entry.parserType))].map((type) => [type, entries.filter((entry) => entry.parserType === type).length]));
  return { total: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0), byType, byParser, hintedManufacturers: new Set(entries.map((entry) => entry.manufacturerHint).filter(Boolean)).size };
}
