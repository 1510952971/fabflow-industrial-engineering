"use client";

/* R2-backed attachment URLs are runtime endpoints; use native img to keep previews unoptimized. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { openMasterData } from "@/lib/client-actions";
import { facilityDomains, facilitySystems, getFacilitySystem } from "@/lib/facility-systems";
import { validateProductSpecifications, type ProductParameterDefinition } from "@/lib/product-catalog";
import { matchCatalog, type CatalogCandidate, type CatalogMatch } from "@/lib/catalog-selection-engine";
import { ProjectCatalogSelection } from "./project-catalog-selection";
import { CatalogSourceImport, type CatalogSourceCandidate } from "./catalog-source-import";

type Notify = (message: string) => void;
type Category = { id: string; code: string; name: string; discipline: string; applicableSystemsJson: string; icon: string; description: string; status: string };
type Attachment = { id: string; entityType: string; entityId: string; category: string; fileName: string; contentType: string; sizeBytes: number; version: number; status: string; createdAt?: string };

type PendingImage = { id: string; file: File; name: string; preview: string };

type Product = {
  id: string; categoryId: string; factoryId?: string | null; manufacturer: string; brand: string; productCode: string; productName: string;
  series: string; model: string; description: string; country: string; lifecycleStatus: string; applicableSystemsJson: string; mediaJson: string; imagesJson: string;
  minPressureMpa?: number | null; maxPressureMpa?: number | null; minTemperatureC?: number | null; maxTemperatureC?: number | null;
  nominalSize?: string | null; connectionStandard?: string | null; wettedMaterialsJson: string; surfaceFinish?: string | null; cleanlinessGrade?: string | null;
  maxFlow?: number | null; flowUnit?: string | null; supplyVoltage?: string | null; signalProtocol?: string | null; ingressProtection?: string | null;
  hazardousAreaRating?: string | null; certificationsJson: string; standardsJson: string; specificationsJson: string; sourceDocument?: string | null;
  sourceUrl?: string | null; sourcePage?: string | null; revision: string; status: string;
};
type Variant = { id: string; productId: string; sku: string; name: string; leadTimeWeeks?: number | null; unitPriceCny?: number | null; status: string };
type Application = { id: string; productId: string; systemCode: string; service: string; medium: string; suitability: string; limitations: string };
type Material = { id: string; manufacturer: string; code: string; name: string; grade: string; baseMaterial: string; surfaceFinish: string; cleanlinessGrade: string; maxPressureMpa: number; minTemperatureC: number; maxTemperatureC: number; certificationsJson: string; status: string };
type QuickMatchInput = { systemCode: string; categoryId: string; medium: string; pressure: string; temperature: string; nominalSize: string; connectionStandard: string; materialsText: string; brand: string; standardsText: string; certificationsText: string; dynamic: Record<string, unknown> };
type Draft = Omit<Product, "id" | "applicableSystemsJson" | "mediaJson" | "wettedMaterialsJson" | "certificationsJson" | "standardsJson" | "specificationsJson" | "imagesJson"> & {
  id?: string; systems: string[]; mediaText: string; materialsText: string; certificationsText: string; standardsText: string;
};
type CustomSpecification = {
  id: string; key: string; label: string; value: string; unit: string; note: string; dataType: "text" | "number" | "boolean";
};

const CUSTOM_SPEC_META_KEY = "__customFields";
const customKeyFromLabel = (label: string, fallback: string) => {
  const normalized = label.trim().toLowerCase().replace(/[\s/\\]+/g, "_").replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/g, "");
  return "custom." + (normalized || fallback.replaceAll("-", ""));
};
const newCustomSpecification = (): CustomSpecification => {
  const id = crypto.randomUUID();
  return { id, key: customKeyFromLabel("", id), label: "", value: "", unit: "", note: "", dataType: "text" };
};

const emptyDraft = (categoryId = ""): Draft => ({
  categoryId, manufacturer: "", brand: "", productCode: "", productName: "", series: "", model: "", description: "", country: "",
  lifecycleStatus: "active", systems: [], mediaText: "", minPressureMpa: null, maxPressureMpa: null, minTemperatureC: null, maxTemperatureC: null,
  nominalSize: "", connectionStandard: "", materialsText: "", surfaceFinish: "", cleanlinessGrade: "", maxFlow: null, flowUnit: "",
  supplyVoltage: "", signalProtocol: "", ingressProtection: "", hazardousAreaRating: "", certificationsText: "", standardsText: "",
  sourceDocument: "", sourceUrl: "", sourcePage: "", revision: "A", status: "draft",
});

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []; }
  catch { return value.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean); }
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}

function readCustomSpecifications(value: unknown): CustomSpecification[] {
  const source = parseObject(value);
  const rows = Array.isArray(source[CUSTOM_SPEC_META_KEY]) ? source[CUSTOM_SPEC_META_KEY] as Array<Record<string, unknown>> : [];
  return rows.map((row) => ({
    id: String(row.id || row.key), key: String(row.key || ""), label: String(row.label || row.key || ""),
    value: source[String(row.key || "")] === undefined ? "" : String(source[String(row.key || "")]), unit: String(row.unit || ""),
    note: String(row.note || ""), dataType: (row.dataType === "number" || row.dataType === "boolean" ? row.dataType : "text") as CustomSpecification["dataType"],
  })).filter((row) => row.key);
}
function stripCustomSpecifications(value: unknown) {
  const source = { ...parseObject(value) };
  for (const row of readCustomSpecifications(source)) delete source[row.key];
  delete source[CUSTOM_SPEC_META_KEY];
  return source;
}
function serializeSpecifications(standard: Record<string, unknown>, custom: CustomSpecification[]) {
  const values: Record<string, unknown> = { ...standard };
  for (const row of custom) values[row.key] = row.dataType === "number" ? Number(row.value) : row.dataType === "boolean" ? row.value === "true" : row.value;
  values[CUSTOM_SPEC_META_KEY] = custom.map((row) => ({ id: row.id, key: row.key, label: row.label, unit: row.unit, note: row.note, dataType: row.dataType }));
  return values;
}

function listText(value: unknown) { return parseArray(value).join("、"); }
function optionalNumber(value: unknown) { return value === "" || value === null || value === undefined ? null : Number(value); }
function displaySpec(value: unknown, unit?: string | null) {
  if (value === true) return "是";
  if (value === false) return "否";
  if (value === null || value === undefined || value === "") return "—";
  return `${String(value)}${unit ? ` ${unit}` : ""}`;
}

function imageUrl(id: string) {
  return `/api/files?download=${encodeURIComponent(id)}&inline=1`;
}

function readImagePreview(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("图片预览读取失败"));
    reader.readAsDataURL(file);
  });
}
export function FacilityEquipmentPage({ notify }: { notify: Notify }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [definitions, setDefinitions] = useState<ProductParameterDefinition[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [canWriteGlobal, setCanWriteGlobal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [systemCode, setSystemCode] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [status, setStatus] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [specifications, setSpecifications] = useState<Record<string, unknown>>({});
  const [customSpecifications, setCustomSpecifications] = useState<CustomSpecification[]>([]);
  const [imageFilesByProduct, setImageFilesByProduct] = useState<Record<string, Attachment[]>>({});
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [quickInput, setQuickInput] = useState<QuickMatchInput>({ systemCode: "all", categoryId: "all", medium: "", pressure: "", temperature: "", nominalSize: "", connectionStandard: "", materialsText: "", brand: "", standardsText: "", certificationsText: "", dynamic: {} });
  const [quickMatches, setQuickMatches] = useState<CatalogMatch[]>([]);

  const loadImages = async () => {
    try {
      const response = await fetch("/api/files?entityType=catalogProducts&category=product_image", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { files?: Attachment[] };
      const grouped: Record<string, Attachment[]> = {};
      for (const file of payload.files ?? []) (grouped[file.entityId] ??= []).push(file);
      setImageFilesByProduct(grouped);
    } catch {
      // Product metadata remains usable when R2 is not bound in local development.
    }
  };
  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/master-data?entities=productCategories,productParameterDefinitions,catalogProducts,productVariants,productApplications,materials&pageSize=500", { cache: "no-store" });
      const payload = await response.json() as { error?: string; data?: { productCategories?: Category[]; productParameterDefinitions?: ProductParameterDefinition[]; catalogProducts?: Product[]; productVariants?: Variant[]; productApplications?: Application[]; materials?: Material[] }; permissions?: { canWriteGlobal?: boolean } };
      if (!response.ok) throw new Error(payload.error || "产品型录加载失败");
      setCategories((payload.data?.productCategories ?? []).filter((item) => item.status !== "archived"));
      setDefinitions((payload.data?.productParameterDefinitions ?? []).filter((item) => item.status !== "archived"));
      setProducts((payload.data?.catalogProducts ?? []).filter((item) => item.status !== "archived"));
      setVariants((payload.data?.productVariants ?? []).filter((item) => item.status !== "archived"));
      setApplications(payload.data?.productApplications ?? []);
      setMaterials(payload.data?.materials ?? []);
      setCanWriteGlobal(Boolean(payload.permissions?.canWriteGlobal));
      void loadImages();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "产品型录加载失败"); }
    finally { setLoading(false); }
  };

  // `load` intentionally runs once on mount; it closes over the initial fetch helpers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const definitionsFor = (targetCategoryId: string) => definitions.filter((item) => item.categoryId === targetCategoryId).sort((a, b) => a.sortOrder - b.sortOrder);
  const shown = useMemo(() => products.filter((product) => {
    const category = categoryMap.get(product.categoryId);
    const systems = parseArray(product.applicableSystemsJson);
    const text = `${product.brand} ${product.manufacturer} ${product.productCode} ${product.productName} ${product.series} ${product.model} ${product.description} ${product.sourceDocument ?? ""} ${product.specificationsJson} ${category?.name ?? ""}`.toLowerCase();
    return (systemCode === "all" || systems.includes(systemCode))
      && (categoryId === "all" || product.categoryId === categoryId)
      && (status === "all" || product.status === status)
      && (!query.trim() || text.includes(query.trim().toLowerCase()));
  }), [products, categoryMap, systemCode, categoryId, status, query]);

  const currentDefinitions = definitionsFor(draft.categoryId);
  const quickDefinitions = quickInput.categoryId === "all" ? [] : definitionsFor(quickInput.categoryId);
  const splitQuickList = (value: string) => value.split(/[,，;；\n]+/).map((item) => item.trim()).filter(Boolean);
  const toQuickNumber = (value: string) => value.trim() === "" ? null : Number(value);
  const quickCandidates = useMemo<CatalogCandidate[]>(() => [
    ...products.map((product) => product as unknown as CatalogCandidate),
    ...materials.map((material) => ({
      id: "material:" + material.id, categoryId: "", brand: material.manufacturer, status: material.status, applicableSystemsJson: "[]", mediaJson: "[]",
      minPressureMpa: 0, maxPressureMpa: material.maxPressureMpa, minTemperatureC: material.minTemperatureC, maxTemperatureC: material.maxTemperatureC,
      nominalSize: null, connectionStandard: null, wettedMaterialsJson: JSON.stringify([material.grade, material.baseMaterial]),
      certificationsJson: material.certificationsJson, standardsJson: "[]", specificationsJson: JSON.stringify({ surfaceFinish: material.surfaceFinish, cleanlinessGrade: material.cleanlinessGrade }),
    })),
  ], [products, materials]);
  const quickRows = useMemo(() => quickMatches.map((result) => ({
    result, product: products.find((item) => item.id === result.productId) ?? null,
    material: materials.find((item) => "material:" + item.id === result.productId) ?? null,
  })), [quickMatches, products, materials]);
  const runQuickMatch = () => {
    const hasInput = [quickInput.medium, quickInput.pressure, quickInput.temperature, quickInput.nominalSize, quickInput.connectionStandard, quickInput.materialsText, quickInput.brand, quickInput.standardsText, quickInput.certificationsText].some(Boolean) || Object.keys(quickInput.dynamic).length > 0 || quickInput.categoryId !== "all" || quickInput.systemCode !== "all";
    if (!hasInput) { notify("请至少输入一个选型条件；系统会在全部型录产品和材料主档中匹配"); return; }
    const requiredSpecifications = Object.fromEntries(Object.entries(quickInput.dynamic).filter(([, value]) => value !== "" && value !== null && value !== undefined).map(([key, value]) => {
      const definition = quickDefinitions.find((item) => item.key === key);
      return [key, definition?.dataType === "number" ? { min: Number(value) } : { equals: value }];
    }));
    const requirement = {
      categoryId: quickInput.categoryId === "all" ? "" : quickInput.categoryId, systemCode: quickInput.systemCode === "all" ? "" : quickInput.systemCode,
      medium: quickInput.medium.trim() || null, designPressureMpa: toQuickNumber(quickInput.pressure), designTemperatureC: toQuickNumber(quickInput.temperature),
      nominalSize: quickInput.nominalSize.trim() || null, connectionStandard: quickInput.connectionStandard.trim() || null,
      requiredMaterialsJson: splitQuickList(quickInput.materialsText), requiredBrandsJson: splitQuickList(quickInput.brand),
      requiredStandardsJson: splitQuickList(quickInput.standardsText), requiredCertificationsJson: splitQuickList(quickInput.certificationsText), requiredSpecificationsJson: requiredSpecifications,
    };
    const matches = matchCatalog(requirement, quickCandidates).map((item) => {
      const checks = item.checks.map((check) => check.code === "medium" && check.status === "fail" && /(specialty|semiconductor.*gas|uhp.*gas|process gas|all gas)/i.test(check.actual)
        ? { ...check, status: "warning" as const, message: "产品仅标注介质大类，需由工程师确认具体介质兼容性" }
        : check);
      const failures = checks.filter((check) => check.status === "fail");
      const warnings = checks.filter((check) => check.status === "warning");
      const approvalOnly = failures.length === 1 && failures[0].code === "approval";
      if (approvalOnly) return { ...item, checks, status: "attention" as const, score: Math.max(82 - warnings.length * 3, 70) };
      if (!failures.length) return { ...item, checks, status: warnings.length ? "attention" as const : "passed" as const, score: Math.max(100 - warnings.length * 7, 0) };
      return { ...item, checks };
    }).sort((a, b) => {
      const rank = { passed: 0, attention: 1, blocked: 2 };
      return rank[a.status] - rank[b.status] || Number(a.productId.startsWith("material:")) - Number(b.productId.startsWith("material:")) || b.score - a.score;
    });
    setQuickMatches(matches);
    notify("已完成全库匹配：" + matches.filter((item) => item.status !== "blocked").length + " 个可用候选，" + matches.filter((item) => item.status === "blocked").length + " 个被规则拦截");
  };
  const editorValidation = validateProductSpecifications(specifications, currentDefinitions);
  const customKeyCounts = new Map<string, number>();
  for (const row of customSpecifications) customKeyCounts.set(row.key, (customKeyCounts.get(row.key) ?? 0) + 1);
  const customValidationIssues = customSpecifications.flatMap((row, index) => {
    const issues: string[] = [];
    if (!row.label.trim()) issues.push(`自定义规格 ${index + 1} 缺少字段名称`);
    if (!row.value.trim()) issues.push(`${row.label.trim() || `自定义规格 ${index + 1}`} 缺少字段值`);
    if (row.dataType === "number" && row.value.trim() && !Number.isFinite(Number(row.value))) issues.push(`${row.label.trim()} 必须是有效数字`);
    if ((customKeyCounts.get(row.key) ?? 0) > 1) issues.push(`自定义规格“${row.label.trim()}”重复`);
    return issues;
  });
  const editorValid = editorValidation.valid && customValidationIssues.length === 0;
  const groupedDefinitions = (() => {
    const groups = new Map<string, ProductParameterDefinition[]>();
    for (const definition of currentDefinitions) groups.set(definition.groupName, [...(groups.get(definition.groupName) ?? []), definition]);
    return [...groups.entries()];
  })();

  const startNew = () => {
    if (!canWriteGlobal) { notify("请使用平台管理员账号录入或维护全局产品型录"); return; }
    const initialCategory = categories[0]?.id ?? "";
    setDraft(emptyDraft(initialCategory)); setSpecifications({}); setCustomSpecifications([]); setPendingImages([]); setRemovedImageIds([]); setError(""); setEditorOpen(true);
  };

  const editProduct = (product: Product) => {
    if (!canWriteGlobal) { setDetailId(product.id); notify("当前为公开只读浏览；管理员登录后可编辑产品规格"); return; }
    setDraft({
      ...product,
      systems: parseArray(product.applicableSystemsJson), mediaText: listText(product.mediaJson), materialsText: listText(product.wettedMaterialsJson),
      certificationsText: listText(product.certificationsJson), standardsText: listText(product.standardsJson),
    });
    setSpecifications(stripCustomSpecifications(product.specificationsJson)); setCustomSpecifications(readCustomSpecifications(product.specificationsJson)); setPendingImages([]); setRemovedImageIds([]); setError(""); setEditorOpen(true);
  };

  const updateDraft = (key: keyof Draft, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));
  const addCustomSpecification = () => setCustomSpecifications((current) => [...current, newCustomSpecification()]);
  const updateCustomSpecification = (id: string, patch: Partial<CustomSpecification>) => setCustomSpecifications((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const removeCustomSpecification = (id: string) => setCustomSpecifications((current) => current.filter((row) => row.id !== id));
  const toggleSystem = (code: string) => setDraft((current) => ({ ...current, systems: current.systems.includes(code) ? current.systems.filter((item) => item !== code) : [...current.systems, code] }));

  const referencedImages = (product: Product) => {
    const ids = new Set(parseArray(product.imagesJson));
    return (imageFilesByProduct[product.id] ?? []).filter((file) => ids.has(file.id));
  };

  const addImageFiles = async (fileList: FileList | null) => {
    const selected = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (!selected.length) { setError("请选择 PNG、JPG、WEBP 等图片文件"); return; }
    if (selected.some((file) => file.size > 25 * 1024 * 1024)) { setError("单张产品图片不能超过 25MB"); return; }
    const existingCount = draft.id
      ? parseArray(products.find((item) => item.id === draft.id)?.imagesJson).filter((id) => !removedImageIds.includes(id)).length
      : 0;
    const available = Math.max(0, 8 - existingCount - pendingImages.length);
    const next: PendingImage[] = [];
    for (const file of selected.slice(0, available)) next.push({ id: crypto.randomUUID(), file, name: file.name, preview: await readImagePreview(file) });
    if (selected.length > available) notify("最多保留 8 张产品图片，超出的文件未加入");
    setPendingImages((current) => [...current, ...next]);
    setError("");
  };

  const uploadProductImage = async (productId: string, image: PendingImage) => {
    const form = new FormData();
    form.append("file", image.file, image.name);
    form.append("entityType", "catalogProducts");
    form.append("entityId", productId);
    form.append("category", "product_image");
    const response = await fetch("/api/files", { method: "POST", body: form });
    const payload = await response.json() as { error?: string; file?: Attachment };
    if (!response.ok || !payload.file) throw new Error(payload.error || "产品图片上传失败");
    return payload.file;
  };

  const archiveProductImage = async (id: string) => {
    const response = await fetch("/api/files", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: "archive" }) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || "产品图片移除失败");
    }
  };
  const save = async () => {
    const missing = [
      [draft.categoryId, "产品分类"], [draft.manufacturer, "制造商"], [draft.brand, "品牌"], [draft.productCode, "产品编码"],
      [draft.productName, "产品名称"], [draft.model, "完整型号"], [draft.systems.length, "适用系统"], [draft.sourceDocument || draft.sourceUrl, "来源文件或厂家链接"],
    ].filter(([value]) => !value).map(([, label]) => label);
    if (missing.length) { setError(`请填写：${missing.join("、")}`); return; }
    if (!editorValidation.valid) { setError(editorValidation.issues.map((issue) => issue.message).join("；")); return; }
    if (customValidationIssues.length) { setError(customValidationIssues.join("；")); return; }
    const queuedImages = [...pendingImages];
    setSaving(true); setError("");
    try {
      const existingImageIds = draft.id ? parseArray(products.find((item) => item.id === draft.id)?.imagesJson) : [];
      const keepImageIds = existingImageIds.filter((id) => !removedImageIds.includes(id));
      const data = {
        categoryId: draft.categoryId, factoryId: draft.factoryId || null, manufacturer: draft.manufacturer, brand: draft.brand, productCode: draft.productCode,
        productName: draft.productName, series: draft.series, model: draft.model, description: draft.description, country: draft.country, lifecycleStatus: draft.lifecycleStatus,
        applicableSystemsJson: draft.systems, mediaJson: parseArray(draft.mediaText), imagesJson: keepImageIds, minPressureMpa: optionalNumber(draft.minPressureMpa), maxPressureMpa: optionalNumber(draft.maxPressureMpa),
        minTemperatureC: optionalNumber(draft.minTemperatureC), maxTemperatureC: optionalNumber(draft.maxTemperatureC), nominalSize: draft.nominalSize || null,
        connectionStandard: draft.connectionStandard || null, wettedMaterialsJson: parseArray(draft.materialsText), surfaceFinish: draft.surfaceFinish || null,
        cleanlinessGrade: draft.cleanlinessGrade || null, maxFlow: optionalNumber(draft.maxFlow), flowUnit: draft.flowUnit || null, supplyVoltage: draft.supplyVoltage || null,
        signalProtocol: draft.signalProtocol || null, ingressProtection: draft.ingressProtection || null, hazardousAreaRating: draft.hazardousAreaRating || null,
        certificationsJson: parseArray(draft.certificationsText), standardsJson: parseArray(draft.standardsText), specificationsJson: serializeSpecifications(specifications, customSpecifications),
        sourceDocument: draft.sourceDocument || null, sourceUrl: draft.sourceUrl || null, sourcePage: draft.sourcePage || null, revision: draft.revision, status: draft.status,
      };
      const response = await fetch("/api/master-data", { method: draft.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: "catalogProducts", id: draft.id, data }) });
      const payload = await response.json() as { error?: string; item?: Product };
      if (!response.ok || !payload.item) throw new Error(payload.error || "产品保存失败");
      const savedItem = payload.item;
      const savedItemId = savedItem.id;
      const wasNew = !draft.id;

      // Persist the new id immediately so a failed image upload retries with PATCH instead of creating a duplicate product.
      if (wasNew) setDraft((current) => ({ ...current, id: savedItemId }));
      setProducts((current) => wasNew
        ? [savedItem, ...current.filter((item) => item.id !== savedItemId)]
        : current.map((item) => item.id === savedItemId ? savedItem : item));

      for (const imageId of removedImageIds) await archiveProductImage(imageId);
      setRemovedImageIds([]);

      const initialFiles = (imageFilesByProduct[savedItemId] ?? []).filter((file) => keepImageIds.includes(file.id));
      setImageFilesByProduct((current) => ({ ...current, [savedItemId]: initialFiles }));

      const uploadQueue = async (
        remaining: PendingImage[],
        currentProduct: Product,
        currentImageIds: string[],
        currentFiles: Attachment[],
      ): Promise<Product> => {
        const [image, ...rest] = remaining;
        if (!image) return currentProduct;
        const uploaded = await uploadProductImage(savedItemId, image);
        const linkedImageIds = [...currentImageIds, uploaded.id];
        const imageResponse = await fetch("/api/master-data", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: "catalogProducts", id: savedItemId, data: { imagesJson: linkedImageIds } }) });
        const imagePayload = await imageResponse.json() as { error?: string; item?: Product };
        if (!imageResponse.ok || !imagePayload.item) {
          await archiveProductImage(uploaded.id).catch(() => undefined);
          throw new Error(imagePayload.error || "产品图片关联失败");
        }
        const updatedProduct = imagePayload.item;
        const updatedFiles = [...currentFiles, uploaded];
        setImageFilesByProduct((current) => ({ ...current, [savedItemId]: updatedFiles }));
        setProducts((current) => current.map((item) => item.id === savedItemId ? updatedProduct : item));
        setPendingImages((current) => current.filter((item) => item.id !== image.id));
        return uploadQueue(rest, updatedProduct, linkedImageIds, updatedFiles);
      };

      const finalItem = await uploadQueue(queuedImages, savedItem, keepImageIds, initialFiles);
      setPendingImages([]); setEditorOpen(false);
      notify(queuedImages.length
        ? `${finalItem.brand} ${finalItem.model} 已写入 D1，${queuedImages.length} 张图片已保存到 R2`
        : `${finalItem.brand} ${finalItem.model} 已写入 D1`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "产品保存失败"); }
    finally { setSaving(false); }
  };


  const startFromCandidate = (candidate: CatalogSourceCandidate) => {
    if (!canWriteGlobal) { notify("请使用平台管理员账号录入全局型录产品"); return; }
    const source = parseObject(candidate.parametersJson);
    const categoryId = categories.find((item) => candidate.categoryHint && item.name.toLowerCase().includes(candidate.categoryHint.toLowerCase()))?.id ?? categories[0]?.id ?? "";
    setDraft({ ...emptyDraft(categoryId), manufacturer: candidate.manufacturer, brand: candidate.brand, productName: candidate.productName, model: candidate.model, sourceDocument: typeof source.sourceFile === "string" ? source.sourceFile : "" });
    setSpecifications({}); setCustomSpecifications([]); setPendingImages([]); setRemovedImageIds([]); setError(""); setEditorOpen(true);
    notify("候选已带入产品录入，请补齐分类、系统、参数和来源页码");
  };

  const completeness = (product: Product) => validateProductSpecifications(product.specificationsJson, definitionsFor(product.categoryId));
  const sourcedCount = products.filter((item) => item.sourceDocument || item.sourceUrl).length;

  return <>
    <div className="moduleTop productCatalogTop"><div><span>GLOBAL FAB PRODUCT CATALOG</span><h2>全局设备材料型录库</h2><p>全公司项目共享同一份产品主档，不随项目复制；项目依据各自上传的技术规格书，从这里匹配并引用合格产品。</p></div><div className="moduleActions"><button className="softButton" onClick={() => openMasterData("productCategories")}>分类与参数模板</button><button className="softButton" onClick={() => openMasterData("productVariants")}>型号 / 选配</button><CatalogSourceImport canWriteGlobal={canWriteGlobal} notify={notify} onUseCandidate={startFromCandidate} /><button className="primaryButton" disabled={!canWriteGlobal} title={canWriteGlobal ? "录入型录产品" : "平台管理员登录后开放"} onClick={startNew}>＋ 录入产品</button></div></div>
    {error && !editorOpen && <div className="masterError"><i>!</i><span><b>产品型录需要处理</b><small>{error}</small></span><button onClick={() => setError("")}>×</button></div>}
    <ProjectCatalogSelection categories={categories} notify={notify} />
    <section className="card catalogQuickMatch">
      <header className="catalogQuickMatchHeader"><div><span>PARAMETER AUTO MATCH</span><h3>输入参数，自动配对全库产品</h3><p>覆盖全部产品分类与材料主档；先按通用工程条件筛选，再按分类专用规格逐项校验，并显示每条匹配依据。</p></div><b>全库 {products.length || "—"} 条产品 · {materials.length || "—"} 条材料主档</b></header>
      <div className="catalogQuickForm">
        <label><span>适用系统</span><select value={quickInput.systemCode} onChange={(event) => setQuickInput((current) => ({ ...current, systemCode: event.target.value }))}><option value="all">全部系统</option>{facilitySystems.map((item) => <option value={item.code} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span>产品分类</span><select value={quickInput.categoryId} onChange={(event) => setQuickInput((current) => ({ ...current, categoryId: event.target.value, dynamic: {} }))}><option value="all">全部分类</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label><span>介质</span><input value={quickInput.medium} onChange={(event) => setQuickInput((current) => ({ ...current, medium: event.target.value }))} placeholder="例如 SiH4 / UPW / CDA" /></label>
        <label><span>设计压力 MPa</span><input type="number" step="any" value={quickInput.pressure} onChange={(event) => setQuickInput((current) => ({ ...current, pressure: event.target.value }))} placeholder="要求值" /></label>
        <label><span>设计温度 °C</span><input type="number" step="any" value={quickInput.temperature} onChange={(event) => setQuickInput((current) => ({ ...current, temperature: event.target.value }))} placeholder="要求值" /></label>
        <label><span>公称尺寸 / 规格</span><input value={quickInput.nominalSize} onChange={(event) => setQuickInput((current) => ({ ...current, nominalSize: event.target.value }))} placeholder="例如 1/4 in / DN25" /></label>
        <label><span>接口标准</span><input value={quickInput.connectionStandard} onChange={(event) => setQuickInput((current) => ({ ...current, connectionStandard: event.target.value }))} placeholder="VCR / ASME / DIN" /></label>
        <label><span>接液 / 内部材料</span><input value={quickInput.materialsText} onChange={(event) => setQuickInput((current) => ({ ...current, materialsText: event.target.value }))} placeholder="316L VAR, PCTFE, FFKM" /></label>
        <label><span>品牌（可多选）</span><input value={quickInput.brand} onChange={(event) => setQuickInput((current) => ({ ...current, brand: event.target.value }))} placeholder="逗号分隔" /></label>
        <label><span>标准（可多选）</span><input value={quickInput.standardsText} onChange={(event) => setQuickInput((current) => ({ ...current, standardsText: event.target.value }))} placeholder="SEMI F20, IEC ..." /></label>
        <label><span>认证（可多选）</span><input value={quickInput.certificationsText} onChange={(event) => setQuickInput((current) => ({ ...current, certificationsText: event.target.value }))} placeholder="CE, UL, ATEX ..." /></label>
      </div>
      {quickDefinitions.length > 0 && <div className="catalogQuickDynamic"><b>{categoryMap.get(quickInput.categoryId)?.name} 专用参数</b><div>{quickDefinitions.map((field) => { const value = quickInput.dynamic[field.key] ?? ""; const options = parseArray(field.optionsJson); return field.dataType === "select" ? <label key={field.key}><span>{field.label}{field.unit ? " (" + field.unit + ")" : ""}</span><select value={String(value)} onChange={(event) => setQuickInput((current) => ({ ...current, dynamic: { ...current.dynamic, [field.key]: event.target.value } }))}><option value="">不限</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> : <label key={field.key}><span>{field.label}{field.unit ? " (" + field.unit + ")" : ""}</span><input type={field.dataType === "number" ? "number" : "text"} step={field.dataType === "number" ? "any" : undefined} value={String(value)} onChange={(event) => setQuickInput((current) => ({ ...current, dynamic: { ...current.dynamic, [field.key]: field.dataType === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value } }))} placeholder="不限" /></label>; })}</div></div>}
      <footer className="catalogQuickActions"><small>空白字段代表不限；匹配结果按“通过 → 需人工确认 → 拦截”排序。</small><div><button onClick={() => { setQuickMatches([]); setQuickInput({ systemCode: "all", categoryId: "all", medium: "", pressure: "", temperature: "", nominalSize: "", connectionStandard: "", materialsText: "", brand: "", standardsText: "", certificationsText: "", dynamic: {} }); }}>清空</button><button className="primaryButton" onClick={runQuickMatch}>自动匹配产品</button></div></footer>
      {quickRows.length > 0 && <div className="catalogQuickResults"><div className="catalogQuickResultsTitle"><b>匹配结果</b><span>显示前 {Math.min(quickRows.length, 20)} 条，共 {quickRows.length} 条</span></div>{quickRows.slice(0, 20).map(({ result, product, material }) => { const name = product?.productName || material?.name || result.productId; const code = product ? product.brand + " · " + product.model : material ? "材料主档 · " + material.manufacturer + " · " + material.grade : ""; const category = product ? categoryMap.get(product.categoryId)?.name || "未分类" : "材料"; return <article className={"quickMatchResult " + result.status} key={result.productId}><header><strong>{result.score}</strong><div><b>{name}</b><small>{category} · {code}</small></div><em>{result.status === "passed" ? "推荐" : result.status === "attention" ? "需确认" : "不符合"}</em></header><div className="quickMatchChecks">{result.checks.slice(0, 5).map((check) => <p className={check.status} key={check.code}><i>{check.status === "pass" ? "✓" : check.status === "warning" ? "!" : "×"}</i><span><b>{check.label}</b><small>{check.status === "pass" ? "符合" : check.message} · {check.actual || "未填写"}</small></span></p>)}</div><footer>{product && <button onClick={() => { setDetailId(product.id); document.getElementById("catalog-product-" + product.id)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>查看产品详情</button>}{material && <button onClick={() => notify(material.code + " 已定位到材料主档，可在项目技术规格选型中引用")}>查看材料主档</button>}</footer></article>; })}</div>}
    </section>
    <section className="card catalogCoverage"><div><span>产品分类</span><b>{categories.length}<em> 类</em></b><small>管理员可继续扩展</small></div><div><span>规格字段</span><b>{definitions.length}<em> 项</em></b><small>按分类动态显示</small></div><div><span>产品主档</span><b>{products.length}<em> 个</em></b><small>{products.filter((item) => item.status === "approved").length} 个已批准</small></div><div><span>来源可追溯</span><b>{sourcedCount}<em> / {products.length}</em></b><small>本地型录或厂家正式链接</small></div></section>
    <section className="card catalogFilter"><label className="masterSearch">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索品牌、型号、产品名称、来源文件…"/><kbd>{shown.length}</kbd></label><div>
      <label><span>适用系统</span><select value={systemCode} onChange={(event) => setSystemCode(event.target.value)}><option value="all">全部 FAB 系统</option>{facilityDomains.map((domain) => <optgroup label={`${domain.id} · ${domain.name}`} key={domain.id}>{facilitySystems.filter((item) => item.domainId === domain.id).map((system) => <option value={system.code} key={system.id}>{system.code} · {system.name}</option>)}</optgroup>)}</select></label>
      <label><span>产品分类</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="all">全部分类</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <label><span>审核状态</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option><option value="draft">待复核草稿</option><option value="pending_review">待审核</option><option value="approved">已批准</option><option value="conditional">有条件</option></select></label>
    </div></section>
    {loading ? <div className="catalogLoading"><i/><i/><i/></div> : shown.length ? <div className="productCatalogGrid">{shown.map((product) => {
      const category = categoryMap.get(product.categoryId); const systems = parseArray(product.applicableSystemsJson); const validation = completeness(product);
      const productVariants = variants.filter((item) => item.productId === product.id); const productApplications = applications.filter((item) => item.productId === product.id); const detail = detailId === product.id; const productImages = referencedImages(product); const productCustomSpecifications = readCustomSpecifications(product.specificationsJson);
      return <article id={"catalog-product-" + product.id} className={`card productCatalogCard ${detail ? "expanded" : ""}`} key={product.id}><header><div className="catalogProductIcon">{productImages[0] ? <img src={imageUrl(productImages[0].id)} alt={`${product.brand} ${product.model}`} loading="lazy" /> : category?.icon || "◇"}</div><div><small>{category?.name || "未分类"} · {product.productCode}</small><h3>{product.productName}</h3><p>{product.brand} · {product.model}</p></div><span className={`catalogStatus ${product.status}`}>{product.status === "approved" ? "已批准" : product.status === "conditional" ? "有条件" : product.status === "pending_review" ? "待审核" : "待复核"}</span></header>
        <div className="catalogSystemChips">{systems.slice(0, 5).map((code) => { const system = getFacilitySystem(code); return <span className={`chip ${system?.color || "gray"}`} key={code}>{code}</span>; })}{systems.length > 5 && <em>+{systems.length - 5}</em>}</div>
        <div className="catalogKeySpecs"><p><span>压力范围</span><b>{product.minPressureMpa ?? "—"} ～ {product.maxPressureMpa ?? "—"} MPa</b></p><p><span>温度范围</span><b>{product.minTemperatureC ?? "—"} ～ {product.maxTemperatureC ?? "—"} °C</b></p><p><span>接口 / 尺寸</span><b>{[product.connectionStandard, product.nominalSize].filter(Boolean).join(" · ") || "待录入"}</b></p><p><span>接液 / 内部材质</span><b>{listText(product.wettedMaterialsJson) || "待录入"}</b></p></div>
        <div className={`catalogCompleteness ${validation.valid ? "complete" : "incomplete"}`}><i>{validation.valid ? "✓" : "!"}</i><span><b>{validation.valid ? "分类规格完整" : `缺少或错误 ${validation.issues.length} 项`}</b><small>{validation.valid ? "可进入技术审核" : validation.issues.slice(0, 2).map((item) => item.label).join("、")}</small></span></div>
        {detail && <div className="catalogDetail"><div><span>详细分类规格</span>{definitionsFor(product.categoryId).map((definition) => <p key={definition.id || definition.key}><small>{definition.label}</small><b>{displaySpec(parseObject(product.specificationsJson)[definition.key], definition.unit)}</b></p>)}{productCustomSpecifications.map((field) => <p className="custom" key={field.key}><small>{field.label}{field.note ? ` · ${field.note}` : ""}</small><b>{displaySpec(field.dataType === "boolean" ? field.value === "true" : field.value, field.unit)}</b></p>)}</div><div><span>来源与扩展记录</span><p><small>来源文件</small><b>{product.sourceDocument || "—"}</b></p><p><small>来源页码</small><b>{product.sourcePage || "—"}</b></p><p><small>型号变体</small><b>{productVariants.length} 个 SKU</b></p><p><small>系统适用性明细</small><b>{productApplications.length} 条</b></p>{product.sourceUrl && <a href={product.sourceUrl} target="_blank" rel="noreferrer">打开厂家正式资料 ↗</a>}</div></div>}
        <footer><div><button onClick={() => setDetailId(detail ? null : product.id)}>{detail ? "收起详情" : "查看全部参数"}</button><button onClick={() => editProduct(product)}>{canWriteGlobal ? "编辑产品" : "只读查看"}</button></div><div><button onClick={() => { openMasterData("productApplications", product.productCode); notify("已打开产品系统适用性台账"); }}>适用性</button><button className="primaryButton" onClick={() => { document.getElementById("project-catalog-selection")?.scrollIntoView({ behavior: "smooth", block: "start" }); notify("请先选择项目技术规格要求并运行匹配，合格后才能进入 BOM"); }}>按规格书选型</button></div></footer>
      </article>;
    })}</div> : <div className="card catalogEmpty"><i>◇</i><h3>没有符合条件的产品</h3><p>{products.length ? "请调整系统、分类或审核状态筛选条件" : "管理员可录入第一条产品，或在主数据中心批量导入 CSV / JSON"}</p>{canWriteGlobal && <button className="primaryButton" onClick={startNew}>＋ 录入产品</button>}</div>}

    {editorOpen && <><div className="overlay catalogEditorOverlay" onClick={() => !saving && setEditorOpen(false)}/><aside className="catalogEditor"><header><div><span>PRODUCT SPECIFICATION ENTRY</span><h2>{draft.id ? "编辑产品规格" : "录入产品规格"}</h2><p>通用工程字段 + 分类动态字段 + 来源追溯，保存前自动校验</p></div><button disabled={saving} onClick={() => setEditorOpen(false)}>×</button></header>
      {error && <div className="masterError"><i>!</i><span><b>不能保存</b><small>{error}</small></span><button onClick={() => setError("")}>×</button></div>}
      <div className="catalogEditorBody">
        <section><div className="catalogSectionTitle"><b>01 · 产品身份</b><small>品牌、型号和产品分类</small></div><div className="catalogFormGrid">
          <label><span>产品分类 *</span><select value={draft.categoryId} onChange={(event) => { updateDraft("categoryId", event.target.value); setSpecifications({}); }}><option value="">请选择</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label><span>制造商 *</span><input value={draft.manufacturer} onChange={(event) => updateDraft("manufacturer", event.target.value)}/></label><label><span>品牌 *</span><input value={draft.brand} onChange={(event) => updateDraft("brand", event.target.value)}/></label>
          <label><span>产品编码 / 料号 *</span><input value={draft.productCode} onChange={(event) => updateDraft("productCode", event.target.value)}/></label><label className="wide"><span>产品名称 *</span><input value={draft.productName} onChange={(event) => updateDraft("productName", event.target.value)}/></label>
          <label><span>系列</span><input value={draft.series} onChange={(event) => updateDraft("series", event.target.value)}/></label><label className="wide"><span>完整型号 *</span><input value={draft.model} onChange={(event) => updateDraft("model", event.target.value)}/></label>
          <label><span>产地</span><input value={draft.country} onChange={(event) => updateDraft("country", event.target.value)}/></label><label><span>生命周期</span><select value={draft.lifecycleStatus} onChange={(event) => updateDraft("lifecycleStatus", event.target.value)}><option value="active">在产</option><option value="new">新品</option><option value="legacy">旧系列</option><option value="discontinued">停产</option></select></label>
          <label className="wide"><span>用途与说明</span><textarea value={draft.description} onChange={(event) => updateDraft("description", event.target.value)}/></label>
        </div></section>
        <section><div className="catalogSectionTitle"><b>02 · 产品图片</b><small>支持 PNG、JPG、WEBP，保存后写入 R2 并保留附件版本</small></div>
          <div className="catalogImageGrid">
            {(draft.id ? (imageFilesByProduct[draft.id] ?? []).filter((file) => !removedImageIds.includes(file.id) && parseArray(products.find((item) => item.id === draft.id)?.imagesJson).includes(file.id)) : []).map((file) => <figure className="catalogImageThumb" key={file.id}><img src={imageUrl(file.id)} alt={file.fileName} loading="lazy" /><button type="button" aria-label={`移除 ${file.fileName}`} onClick={() => setRemovedImageIds((current) => [...current, file.id])}>×</button><figcaption>{file.fileName}</figcaption></figure>)}
            {pendingImages.map((image) => <figure className="catalogImageThumb pending" key={image.id}><img src={image.preview} alt={image.name} /><button type="button" aria-label={`移除 ${image.name}`} onClick={() => setPendingImages((current) => current.filter((item) => item.id !== image.id))}>×</button><figcaption>{image.name}</figcaption></figure>)}
            <label className="catalogImageUpload"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(event) => { void addImageFiles(event.target.files); event.currentTarget.value = ""; }} /><span>＋</span><b>添加图片</b><small>最多 8 张</small></label>
          </div>
        </section>        <section><div className="catalogSectionTitle"><b>03 · 适用 FAB 系统</b><small>至少选择一个；后续用于选型筛选和系统工程校验</small></div><div className="catalogSystemSelector">{facilitySystems.map((system) => <button className={draft.systems.includes(system.code) ? `active ${system.color}` : ""} key={system.id} onClick={() => toggleSystem(system.code)}><i>{draft.systems.includes(system.code) ? "✓" : "+"}</i><span><b>{system.code}</b><small>{system.shortName}</small></span></button>)}</div><label className="catalogWideField"><span>适用介质（逗号分隔）</span><input value={draft.mediaText} onChange={(event) => updateDraft("mediaText", event.target.value)} placeholder="SiH4, H2, N2, UPW…"/></label></section>
        <section><div className="catalogSectionTitle"><b>04 · 通用工程工况</b><small>所有类别统一可检索、对比和边界校验</small></div><div className="catalogFormGrid">
          <label><span>最低压力 MPa</span><input type="number" step="any" value={draft.minPressureMpa ?? ""} onChange={(event) => updateDraft("minPressureMpa", event.target.value)}/></label><label><span>最高压力 MPa</span><input type="number" step="any" value={draft.maxPressureMpa ?? ""} onChange={(event) => updateDraft("maxPressureMpa", event.target.value)}/></label>
          <label><span>最低温度 °C</span><input type="number" step="any" value={draft.minTemperatureC ?? ""} onChange={(event) => updateDraft("minTemperatureC", event.target.value)}/></label><label><span>最高温度 °C</span><input type="number" step="any" value={draft.maxTemperatureC ?? ""} onChange={(event) => updateDraft("maxTemperatureC", event.target.value)}/></label>
          <label><span>公称尺寸 / 规格</span><input value={draft.nominalSize ?? ""} onChange={(event) => updateDraft("nominalSize", event.target.value)}/></label><label><span>连接 / 接口标准</span><input value={draft.connectionStandard ?? ""} onChange={(event) => updateDraft("connectionStandard", event.target.value)} placeholder="VCR / ASME / DIN / RJ45…"/></label>
          <label className="wide"><span>接液 / 内部材质</span><input value={draft.materialsText} onChange={(event) => updateDraft("materialsText", event.target.value)} placeholder="316L VAR, PCTFE, FFKM…"/></label>
          <label><span>表面处理 / 粗糙度</span><input value={draft.surfaceFinish ?? ""} onChange={(event) => updateDraft("surfaceFinish", event.target.value)} placeholder="EP Ra≤0.25µm"/></label><label><span>洁净等级</span><input value={draft.cleanlinessGrade ?? ""} onChange={(event) => updateDraft("cleanlinessGrade", event.target.value)}/></label>
          <label><span>最大流量</span><input type="number" step="any" value={draft.maxFlow ?? ""} onChange={(event) => updateDraft("maxFlow", event.target.value)}/></label><label><span>流量单位</span><input value={draft.flowUnit ?? ""} onChange={(event) => updateDraft("flowUnit", event.target.value)} placeholder="slpm / Nm³/h / m³/h"/></label>
          <label><span>供电</span><input value={draft.supplyVoltage ?? ""} onChange={(event) => updateDraft("supplyVoltage", event.target.value)}/></label><label><span>信号 / 协议</span><input value={draft.signalProtocol ?? ""} onChange={(event) => updateDraft("signalProtocol", event.target.value)}/></label>
          <label><span>防护等级</span><input value={draft.ingressProtection ?? ""} onChange={(event) => updateDraft("ingressProtection", event.target.value)}/></label><label><span>防爆等级</span><input value={draft.hazardousAreaRating ?? ""} onChange={(event) => updateDraft("hazardousAreaRating", event.target.value)}/></label>
        </div></section>
        <section><div className="catalogSectionTitle"><b>05 · 分类详细规格</b><small>{currentDefinitions.length ? `${currentDefinitions.length} 个字段由“${categoryMap.get(draft.categoryId)?.name}”模板生成` : "该分类尚未配置专用字段"}</small></div>{groupedDefinitions.map(([group, fields]) => <div className="catalogDynamicGroup" key={group}><h4>{group}</h4><div className="catalogFormGrid">{fields.map((field) => {
          const value = specifications[field.key] ?? ""; const options = parseArray(field.optionsJson);
          if (field.dataType === "boolean") return <label className="catalogBoolean" key={field.key}><span><b>{field.label}{field.required ? " *" : ""}</b><small>{field.helpText || "是 / 否"}</small></span><input type="checkbox" checked={Boolean(value)} onChange={(event) => setSpecifications((current) => ({ ...current, [field.key]: event.target.checked }))}/></label>;
          if (field.dataType === "select") return <label key={field.key}><span>{field.label}{field.required ? " *" : ""}</span><select value={String(value)} onChange={(event) => setSpecifications((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">请选择</option>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select>{field.unit && <small>单位：{field.unit}</small>}</label>;
          return <label key={field.key}><span>{field.label}{field.required ? " *" : ""}</span><div className="catalogUnitInput"><input type={field.dataType === "number" ? "number" : "text"} step={field.dataType === "number" ? "any" : undefined} value={String(value)} onChange={(event) => setSpecifications((current) => ({ ...current, [field.key]: field.dataType === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value }))}/>{field.unit && <em>{field.unit}</em>}</div>{field.helpText && <small>{field.helpText}</small>}</label>;
        })}</div></div>)}
          <div className="catalogCustomSpecifications">
            <div className="catalogCustomHead"><div><b>其他自定义规格</b><small>内置模板没有的参数可在这里逐项增加，并随产品保存、检索和匹配。</small></div><button type="button" onClick={addCustomSpecification}>＋ 添加自定义规格</button></div>
            {customSpecifications.length ? <div className="catalogCustomRows">{customSpecifications.map((row, index) => <div className="catalogCustomRow" key={row.id}>
              <i>{String(index + 1).padStart(2, "0")}</i>
              <label><span>字段名称 *</span><input value={row.label} onChange={(event) => updateCustomSpecification(row.id, { label: event.target.value, key: customKeyFromLabel(event.target.value, row.id) })} placeholder="例如 泄漏率 / 过滤精度" /><small>匹配键：{row.key}</small></label>
              <label><span>数据类型</span><select value={row.dataType} onChange={(event) => updateCustomSpecification(row.id, { dataType: event.target.value as CustomSpecification["dataType"], value: "" })}><option value="text">文本</option><option value="number">数字</option><option value="boolean">是 / 否</option></select></label>
              <label><span>字段值 *</span>{row.dataType === "boolean" ? <select value={row.value} onChange={(event) => updateCustomSpecification(row.id, { value: event.target.value })}><option value="">请选择</option><option value="true">是</option><option value="false">否</option></select> : <input type={row.dataType === "number" ? "number" : "text"} step={row.dataType === "number" ? "any" : undefined} value={row.value} onChange={(event) => updateCustomSpecification(row.id, { value: event.target.value })} placeholder="填写规格值" />}</label>
              <label><span>单位</span><input value={row.unit} onChange={(event) => updateCustomSpecification(row.id, { unit: event.target.value })} placeholder="Pa / μm / L/min" /></label>
              <label className="note"><span>说明 / 条件</span><input value={row.note} onChange={(event) => updateCustomSpecification(row.id, { note: event.target.value })} placeholder="测试条件、允许范围或来源条款" /></label>
              <button type="button" className="remove" onClick={() => removeCustomSpecification(row.id)} aria-label={`删除自定义规格 ${row.label || index + 1}`}>×</button>
            </div>)}</div> : <div className="catalogCustomEmpty"><span>＋</span><p><b>暂无自定义规格</b><small>遇到模板未覆盖的样册参数时，点击“添加自定义规格”。</small></p></div>}
          </div>
        </section>
        <section><div className="catalogSectionTitle"><b>06 · 标准、认证与来源</b><small>每条产品必须能追溯到本地型录或厂家正式资料</small></div><div className="catalogFormGrid">
          <label className="wide"><span>认证（逗号分隔）</span><input value={draft.certificationsText} onChange={(event) => updateDraft("certificationsText", event.target.value)} placeholder="CE, UL, ATEX…"/></label><label className="wide"><span>符合标准（逗号分隔）</span><input value={draft.standardsText} onChange={(event) => updateDraft("standardsText", event.target.value)} placeholder="SEMI F20, IEC 60947-7-1…"/></label>
          <label className="wide"><span>来源文件 *</span><input value={draft.sourceDocument ?? ""} onChange={(event) => updateDraft("sourceDocument", event.target.value)} placeholder="材料型录/文件名.pdf"/></label><label className="wide"><span>厂家正式资料 URL *</span><input value={draft.sourceUrl ?? ""} onChange={(event) => updateDraft("sourceUrl", event.target.value)} placeholder="https://manufacturer.example/datasheet"/></label>
          <label><span>来源页码 / 条款</span><input value={draft.sourcePage ?? ""} onChange={(event) => updateDraft("sourcePage", event.target.value)}/></label><label><span>数据版本</span><input value={draft.revision} onChange={(event) => updateDraft("revision", event.target.value)}/></label>
          <label><span>审核状态</span><select value={draft.status} onChange={(event) => updateDraft("status", event.target.value)}><option value="draft">待复核草稿</option><option value="pending_review">待审核</option><option value="approved">已批准</option><option value="conditional">有条件</option><option value="rejected">驳回</option></select></label>
        </div></section>
      </div>
      <footer><div className={editorValid ? "valid" : "invalid"}><i>{editorValid ? "✓" : "!"}</i><span><b>{editorValid ? "产品规格校验通过" : `还有 ${editorValidation.issues.length + customValidationIssues.length} 个规格问题`}</b><small>{editorValid ? `内置字段和 ${customSpecifications.length} 个自定义字段将写入版本与审计日志` : [...editorValidation.issues.map((item) => item.label), ...customValidationIssues].slice(0, 3).join("、")}</small></span></div><button disabled={saving} onClick={() => setEditorOpen(false)}>取消</button><button className="primaryButton" disabled={saving || !editorValid} onClick={() => void save()}>{saving ? "保存中…" : draft.id ? "保存修改" : "创建产品"}</button></footer>
    </aside></>}
  </>;
}
