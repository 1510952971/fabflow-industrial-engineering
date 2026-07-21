export type CatalogTextPage = { page: number; text: string };

export type CatalogTechnicalExtraction = {
  textChars: number;
  sourcePages: number[];
  minPressureMpa: number | null;
  maxPressureMpa: number | null;
  minTemperatureC: number | null;
  maxTemperatureC: number | null;
  nominalSize: string;
  connectionStandard: string;
  wettedMaterials: string[];
  surfaceFinish: string;
  maxFlow: number | null;
  flowUnit: string;
  supplyVoltage: string;
  signalProtocol: string;
  ingressProtection: string;
  hazardousAreaRating: string;
  certifications: string[];
  standards: string[];
  specifications: Record<string, unknown>;
  evidence: Record<string, Array<{ page: number; value: string; context: string }>>;
};

const pressureFactor: Record<string, number> = { mpa: 1, bar: 0.1, psi: 0.00689476, psig: 0.00689476, kpa: 0.001 };
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const compact = (text: string) => text.replace(/\s+/g, " ").trim();
const rounded = (value: number) => Math.round(value * 1000) / 1000;

function contexts(pages: CatalogTextPage[], pattern: RegExp, key: string, evidence: CatalogTechnicalExtraction["evidence"]) {
  const values: Array<{ page: number; value: string; context: string }> = [];
  for (const page of pages) {
    for (const match of page.text.matchAll(pattern)) {
      const value = compact(match[1] ?? match[0]);
      const index = match.index ?? 0;
      values.push({ page: page.page, value, context: compact(page.text.slice(Math.max(0, index - 55), index + match[0].length + 90)).slice(0, 260) });
    }
  }
  if (values.length) evidence[key] = values.slice(0, 20);
  return values;
}

function pressureValues(text: string) {
  return [...text.matchAll(/(\d+(?:[,.]\d+)?)\s*(MPa|bar|psig?|kPa)\b/gi)].map((match) => ({
    raw: `${match[1]} ${match[2]}`,
    mpa: rounded(Number(match[1].replace(",", ".")) * pressureFactor[match[2].toLowerCase()]),
  })).filter((item) => Number.isFinite(item.mpa));
}

export function extractCatalogTechnicalData(pages: CatalogTextPage[], categoryId = "cat-general", productCode = ""): CatalogTechnicalExtraction {
  const normalizedPages = pages.map((page) => ({ ...page, text: compact(page.text) })).filter((page) => page.text);
  const text = normalizedPages.map((page) => page.text).join(" \n ");
  const evidence: CatalogTechnicalExtraction["evidence"] = {};
  const pressureContexts = contexts(normalizedPages, /((?:maximum\s+)?(?:inlet|source|working|operating|rated)\s+pressure(?:s|\s+rating)?[^.;\n]{0,180})/gi, "pressure", evidence);
  const pressures = pressureContexts.flatMap((item) => pressureValues(item.value));
  let maxPressureMpa = pressures.length ? Math.max(...pressures.map((item) => item.mpa)) : null;
  if (/\bAP\s*12\d{2}/i.test(productCode)) {
    const option = /(?:^|[-\s])(HF|HR|FC)(?:$|[-\s])/i.exec(productCode)?.[1]?.toUpperCase();
    if (option) {
      const specific = new RegExp(`AP\\s*1200\\s+${option}[^.;]{0,100}?(\\d+(?:\\.\\d+)?)\\s*bar`, "i").exec(text);
      if (specific) maxPressureMpa = rounded(Number(specific[1]) * 0.1);
    }
  }

  const temperatureContexts = contexts(normalizedPages, /((?:operating|ambient|fluid|media)?\s*temperature[^.;\n]{0,150})/gi, "temperature", evidence);
  const temperaturePairs: Array<[number, number]> = [];
  for (const item of temperatureContexts) {
    for (const match of item.value.matchAll(/([+\-\u2013\u2212]?\d+(?:\.\d+)?)\s*[\u00b0\u02da\u00ba]?\s*(C|F)\s*(?:to|through|[\-\u2013\u2014])\s*([+\-\u2013\u2212]?\d+(?:\.\d+)?)\s*[\u00b0\u02da\u00ba]?\s*(C|F)/gi)) {
      let low = Number(match[1].replace(/[\u2013\u2212]/g, "-")); let high = Number(match[3].replace(/[\u2013\u2212]/g, "-"));
      if (match[2].toUpperCase() === "F") low = (low - 32) * 5 / 9;
      if (match[4].toUpperCase() === "F") high = (high - 32) * 5 / 9;
      temperaturePairs.push([rounded(Math.min(low, high)), rounded(Math.max(low, high))]);
    }
  }

  if (!temperaturePairs.length) {
    for (const item of temperatureContexts) {
      for (const match of item.value.matchAll(/([+\-\u2013\u2212]?\d+(?:\.\d+)?)\s*[\u00b0\u02da\u00ba]?\s*(?:to|through|[\-\u2013\u2014])\s*([+\-\u2013\u2212]?\d+(?:\.\d+)?)\s*[\u00b0\u02da\u00ba]?\s*(C|F)/gi)) {
        let low = Number(match[1].replace(/[\u2013\u2212]/g, "-")); let high = Number(match[2].replace(/[\u2013\u2212]/g, "-"));
        if (match[3].toUpperCase() === "F") { low = (low - 32) * 5 / 9; high = (high - 32) * 5 / 9; }
        temperaturePairs.push([rounded(Math.min(low, high)), rounded(Math.max(low, high))]);
      }
    }
  }

  const materialNames = ["316L VAR", "316L stainless steel", "316 stainless steel", "304 stainless steel", "Ni-Cr-Mo alloy", "Hastelloy C-22", "Hastelloy", "PCTFE", "PTFE", "PFA", "PVDF", "EPDM", "FKM", "Viton", "Kalrez", "Monel", "Nickel", "brass", "aluminum"];
  const wettedMaterials = unique(materialNames.filter((name) => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)));
  if (wettedMaterials.length) evidence.materials = wettedMaterials.map((value) => ({ page: normalizedPages.find((page) => page.text.toLowerCase().includes(value.toLowerCase()))?.page ?? 1, value, context: value }));

  let connectionTokens = unique([
    ...[...text.matchAll(/\b(VCR|VCO|NPT|BSPP|BSPT|Tri-Clamp|face seal|butt weld|tube weld|compression fitting|flange)\b/gi)].map((match) => match[1]),
  ]);
  let sizes = unique([...text.matchAll(/\b(DN\s*\d{1,3}|\d+\s*\/\s*\d+\s*(?:inch|in\.?|”|"))\b/gi)].map((match) => compact(match[1]).replace(/\s+/g, " "))).slice(0, 10);
  const faceSealCodes = [...productCode.matchAll(/\b([FM])V(4|6|8|12)\b/gi)];
  if (faceSealCodes.length) {
    const sizeMap: Record<string, string> = { "4": "1/4 inch", "6": "3/8 inch", "8": "1/2 inch", "12": "3/4 inch" };
    sizes = unique(faceSealCodes.map((match) => sizeMap[match[2]]));
    connectionTokens = unique(faceSealCodes.map((match) => `face seal ${match[1].toUpperCase() === "F" ? "female" : "male"}`));
  }
  if (connectionTokens.length) evidence.connections = [{ page: normalizedPages.find((page) => connectionTokens.some((token) => page.text.toLowerCase().includes(token.toLowerCase())))?.page ?? 1, value: connectionTokens.join(" / "), context: sizes.join(", ") }];

  const finishMatch = text.match(/(?:surface|internal)?\s*finish[^.;]{0,80}?(\d+(?:\.\d+)?)\s*(?:Ra\s*)?(microinch|µin|μin|micrometer|µm|μm)/i) ?? text.match(/(\d+(?:\.\d+)?)\s*(?:Ra\s*)?(microinch|µin|μin)\s*(?:surface\s*)?finish/i);
  const surfaceFinish = finishMatch ? `${finishMatch[1]} ${finishMatch[2]} Ra` : "";
  const flowMatches = [...text.matchAll(/(?:flow rates?|flow capacity|rated flow)[^.;]{0,120}?(?:to\s*)?(\d+(?:[,.]\d+)?)\s*(slpm|sccm|scfm|lpm|gpm|m3\/h|m³\/h)/gi)];
  const maxFlowMatch = flowMatches.sort((a, b) => Number(b[1].replace(",", "")) - Number(a[1].replace(",", "")))[0];
  let maxFlow = maxFlowMatch ? Number(maxFlowMatch[1].replace(",", "")) : null;
  let flowUnit = maxFlowMatch?.[2] ?? "";
  if (/(?:^|[-\s])HF(?:$|[-\s])/i.test(productCode)) {
    const hfFlow = /HF\s+option[^.;]{0,60}?(\d[\d,]*(?:\.\d+)?)\s*(slpm|sccm|scfm|lpm)/i.exec(text);
    if (hfFlow) { maxFlow = Number(hfFlow[1].replace(",", "")); flowUnit = hfFlow[2]; }
  }
  const voltage = unique([...text.matchAll(/\b(\d+(?:\s*[-–]\s*\d+)?\s*V\s*(?:AC|DC))\b/gi)].map((match) => compact(match[1]))).join(" / ");
  const protocols = unique([
    /4\s*[\-\u2013]\s*20\s*mA/i.test(text) ? "4-20 mA" : "", /\bHART\b/i.test(text) ? "HART" : "",
    /\bModbus\b/i.test(text) ? "Modbus" : "", /\bPROFIBUS\b/i.test(text) ? "PROFIBUS" : "",
    /\bPROFINET\b/i.test(text) ? "PROFINET" : "", /\bEtherNet\/IP\b/i.test(text) ? "EtherNet/IP" : "",
    /\bRS[-\s]?485\b/i.test(text) ? "RS-485" : "", /\bBACnet\b/i.test(text) ? "BACnet" : "",
  ]);
  const ingress = unique([...text.matchAll(/\bIP\s*([0-6]\d)\b/gi)].map((match) => `IP${match[1]}`)).join(" / ");
  const hazardous = unique([...text.matchAll(/\b(Class\s+[I1]{1,3}\s*,?\s*Div(?:ision)?\s*[12][^.;]{0,45}|Zone\s*[012](?:\/\d+)?|Ex\s+[a-z]{1,4}\s+I{1,3}[A-Z]?\s*T\d)\b/gi)].map((match) => compact(match[1]))).join(" / ");
  const certifications = unique(["CE", "UL", "FM", "ATEX", "IECEx", "CSA", "SIL", "RoHS", "REACH"].filter((item) => new RegExp(`\\b${item}\\b`, "i").test(text)));
  const standards = unique([...text.matchAll(/\b(?:SEMI\s+[A-Z]\d{1,3}|ASME\s+B\d+(?:\.\d+)+|ANSI\/?ASME\s+B\d+(?:\.\d+)+|ISO\s+\d{3,6}(?:-\d+)?|IEC\s+\d{3,6}(?:-\d+)?|EN\s+\d{3,6}(?:-\d+)?|NFPA\s+\d{1,3})\b/gi)].map((match) => compact(match[0])));

  const specifications: Record<string, unknown> = {};
  const cv = text.match(/\bCv\s*(?:=|of|:)?\s*(\d+(?:\.\d+)?)/i); if (cv) specifications.cv = Number(cv[1]);
  const leak = text.match(/(?:inboard|internal)\s+leak\s+rate[^<\d]{0,20}([<≤]?\s*\d+(?:\.\d+)?\s*x\s*10\s*[-−^]?\s*\d+[^.;]{0,30})/i); if (leak) specifications.internalLeakRate = compact(leak[1]);
  const proof = text.match(/(?:design\s+)?proof\s+pressure[^.;]{0,80}/i); if (proof) specifications.proofPressureText = compact(proof[0]);
  if (categoryId === "cat-regulator") {
    specifications.regulationType = /single\s+stage/i.test(text) ? "single_stage" : /dual|two\s+stage/i.test(text) ? "dual_stage" : /back\s+pressure/i.test(text) ? "back_pressure" : undefined;
    if (maxPressureMpa !== null) specifications.inletPressureRating = maxPressureMpa;
    const outlet = text.match(/outlet\s+pressure\s+ranges?[^.;]{0,180}/i) ?? text.match(/delivery\s+pressure[^.;]{0,180}/i); if (outlet) specifications.outletPressureRange = compact(outlet[0]);
    const seat = wettedMaterials.find((item) => /PCTFE|PTFE|PFA|FKM|Viton|Kalrez/i.test(item)); if (seat) specifications.seatMaterial = seat;
  }
  if (categoryId === "cat-fire-detector") {
    specifications.detectorType = /UVIR|UV\/IR/i.test(text) ? "UV/IR flame detector" : /IR3/i.test(text) ? "IR3 flame detector" : /flame detector/i.test(text) ? "Flame detector" : undefined;
    const range = text.match(/Range[^.;\n]{0,150}/i); if (range) specifications.detectionRange = compact(range[0]);
    const fov = text.match(/(?:cone|field) of vision[^.;\n]{0,80}/i); if (fov) specifications.fieldOfView = compact(fov[0]);
    const response = text.match(/(?:alarm\s+)?response time[^.;\n]{0,80}/i); if (response) specifications.responseTime = compact(response[0]);
    if (/4\s*[–-]\s*20\s*mA/i.test(text)) specifications.analogOutput = "4-20 mA";
    if (/alarm relay/i.test(text)) specifications.relayOutputs = "Alarm / fault relay";
    if (/self[- ]test/i.test(text)) specifications.selfTest = true;
  }
  Object.keys(specifications).forEach((key) => specifications[key] === undefined && delete specifications[key]);
  const sourcePages = unique(Object.values(evidence).flat().map((item) => String(item.page))).map(Number).sort((a, b) => a - b);
  return {
    textChars: text.length, sourcePages, minPressureMpa: null, maxPressureMpa,
    minTemperatureC: temperaturePairs.length ? Math.min(...temperaturePairs.map((pair) => pair[0])) : null,
    maxTemperatureC: temperaturePairs.length ? Math.max(...temperaturePairs.map((pair) => pair[1])) : null,
    nominalSize: sizes.join(", "), connectionStandard: connectionTokens.join(" / "), wettedMaterials, surfaceFinish,
    maxFlow, flowUnit,
    supplyVoltage: voltage, signalProtocol: protocols.join(" / "), ingressProtection: ingress, hazardousAreaRating: hazardous,
    certifications, standards, specifications, evidence,
  };
}
