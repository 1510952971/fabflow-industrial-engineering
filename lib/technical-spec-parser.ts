export type ExtractedTechnicalSpec = {
  title?: string;
  systemCode?: string;
  medium?: string;
  designPressureMpa?: number;
  designTemperatureC?: number;
  nominalSize?: string;
  connectionStandard?: string;
  materials: string[];
  standards: string[];
  certifications: string[];
  brands: string[];
  categoryHint?: string;
};

export type TechnicalSpecParseResult = {
  parserType: string;
  pageCount: number;
  textExcerpt: string;
  extracted: ExtractedTechnicalSpec;
  confidence: Record<string, number>;
};

function firstMatch(text: string, pattern: RegExp) { return text.match(pattern)?.[1]?.trim(); }
function unique(values: string[]) { return [...new Set(values.map((item)=>item.trim()).filter(Boolean))]; }
function convertPressure(value: number, unit: string) {
  const normalized=unit.toLowerCase();
  if(normalized==="bar")return value*.1;
  if(normalized==="kpa")return value/1000;
  if(normalized==="psi")return value*.00689476;
  return value;
}

export function inferTechnicalSpecification(rawText: string): { extracted: ExtractedTechnicalSpec; confidence: Record<string, number> } {
  const text=rawText.replace(/\u0000/g," ").replace(/[ \t]+/g," ");
  const pressureMatch=text.match(/(?:设计|工作|额定|最高|design|working|rated|max(?:imum)?)\s*(?:压力|pressure)?\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(MPa|bar|kPa|psi)/i) || text.match(/(\d+(?:\.\d+)?)\s*(MPa|bar|kPa|psi)/i);
  const temperatureMatch=text.match(/(?:设计|工作|额定|最高|design|working|rated|max(?:imum)?)\s*(?:温度|temperature)?\s*[:：=]?\s*(-?\d+(?:\.\d+)?)\s*(?:°\s*)?[C℃]/i) || text.match(/(-?\d+(?:\.\d+)?)\s*(?:°\s*)?[C℃]/i);
  const size=firstMatch(text, /\b(DN\s*\d{1,4})\b/i) || firstMatch(text, /\b(\d+\s*\/\s*\d+\s*(?:in|inch|英寸|[”"]))/i);
  const connection=firstMatch(text, /\b(VCR|NPT|BSPT|BSPP|SW|BW|Tri[- ]?Clamp|KF|CF|ISO[- ]?K|ASME\s*B16\.5|DIN\s*\d+|Flange|Weld|Flare|RJ45)\b/i);
  const materialPatterns=["316L VAR","316L VIM-VAR","316L EP","316L BA","316L","304L","304","PFA","HP PFA","PVDF","PTFE","PCTFE","FFKM","EPDM","CPVC","FRP","PPH"];
  const materials=unique(materialPatterns.filter((item)=>text.toLowerCase().includes(item.toLowerCase())));
  const standards=unique([...(text.match(/\b(?:SEMI|ASME|ASTM|NFPA|ISO|IEC|GB\/T|GB|DIN|JIS)\s*[A-Z0-9./-]+(?:\s*[-:]\s*\d{2,4})?/gi)??[])].slice(0,20));
  const certifications=unique(["CE","UL","ATEX","SIL","FM","CSA","RoHS"].filter((item)=>new RegExp(`\\b${item}\\b`,"i").test(text)));
  const brandLine=firstMatch(text, /(?:准入品牌|推荐品牌|品牌|approved\s+brand)\s*[:：]\s*([^\n\r]{2,160})/i) || "";
  const brands=unique(brandLine.split(/[、，,;；/]/).map((item)=>item.replace(/[（(].*$/,"").trim()).filter((item)=>item.length<=40));
  const systemMap:[RegExp,string][]=[[/特气|specialty gas|VMB/i,"SGAS"],[/大宗气|bulk gas|BSGS/i,"BSGS"],[/湿化学|chemical delivery|CDS/i,"CDS"],[/超纯水|UPW/i,"UPW"],[/废水|wastewater|WWT/i,"WWT"],[/工艺排风|process exhaust|scrubber/i,"EXH"],[/洁净室|cleanroom|FFU|HEPA/i,"CR"],[/消防|fire protection|sprinkler|VESDA/i,"FIRE"],[/BMS|EPMS|SCADA|PLC|自控/i,"CTRL"],[/压缩空气|CDA/i,"CDA"],[/工艺冷却水|PCW/i,"PCW"],[/冷冻水|CHW/i,"CHW"],[/hook.?up|二次配/i,"HUP"]];
  const systemCode=systemMap.find(([pattern])=>pattern.test(text))?.[1];
  const medium=firstMatch(text, /(?:介质|medium|service)\s*[:：=]\s*([A-Za-z0-9₂₃₄₅₆₂₃₄₅₆() +.-]{1,40})/i) || ["SiH4","Cl2","NH3","H2","N2","Ar","O2","HF","HCl","UPW","CDA"].find((item)=>new RegExp(`\\b${item}\\b`,"i").test(text));
  const title=(text.split(/\r?\n/).map((line)=>line.trim()).find((line)=>line.length>=4&&line.length<=80&&!/目录|contents|page\s+\d/i.test(line))||"").slice(0,80);
  const categoryHint=[[/阀|valve/i,"VALVE"],[/调压|regulator/i,"REGULATOR"],[/泵|pump/i,"PUMP"],[/换热|heat exchanger/i,"HEAT_EXCHANGER"],[/过滤|filter/i,"FILTER"],[/流量计|flow meter|MFC/i,"FLOW_METER"],[/压力表|pressure gauge/i,"PRESSURE_GAUGE"],[/接头|fitting/i,"FITTING"],[/管材|tube|pipe/i,"TUBE_PIPE"],[/风机|fan/i,"FAN"],[/scrubber|洗涤塔/i,"SCRUBBER"]].find(([pattern])=>(pattern as RegExp).test(text))?.[1] as string|undefined;
  const extracted:ExtractedTechnicalSpec={title:title||undefined,systemCode,medium,designPressureMpa:pressureMatch?Number(convertPressure(Number(pressureMatch[1]),pressureMatch[2]).toFixed(4)):undefined,designTemperatureC:temperatureMatch?Number(temperatureMatch[1]):undefined,nominalSize:size?.replace(/\s+/g," "),connectionStandard:connection,materials,standards,certifications,brands,categoryHint};
  const confidence:Record<string,number>={};
  for(const [key,value] of Object.entries(extracted))confidence[key]=Array.isArray(value)?(value.length?0.82:0):value!==undefined&&value!==""?(key==="title"?0.55:0.86):0;
  return {extracted,confidence};
}

export async function parseTechnicalSpecFile(file: File): Promise<TechnicalSpecParseResult> {
  const lower=file.name.toLowerCase(); let text=""; let pageCount=0; let parserType="text";
  if(lower.endsWith(".pdf")||file.type==="application/pdf"){
    parserType="pdfjs";
    const pdfjs=await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
    const document=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    pageCount=document.numPages;
    const pages:string[]=[];
    for(let pageNumber=1;pageNumber<=document.numPages;pageNumber+=1){const page=await document.getPage(pageNumber);const content=await page.getTextContent();pages.push(content.items.map((item)=>"str" in item?item.str:"").join(" "))}
    text=pages.join("\n");
  }else if(/\.(txt|csv|json|md|xml)$/i.test(lower)||file.type.startsWith("text/")){text=await file.text();pageCount=1}
  else{parserType="metadata_only";text=file.name;pageCount=0}
  const {extracted,confidence}=inferTechnicalSpecification(text);
  return {parserType,pageCount,textExcerpt:text.slice(0,4000),extracted,confidence};
}