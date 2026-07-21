import test from "node:test";
import assert from "node:assert/strict";
import { extractCatalogTechnicalData } from "../lib/catalog-content-extraction.ts";

test("extracts regulator pressure temperature materials connections and traceability", () => {
  const result = extractCatalogTechnicalData([{ page: 1, text: "TESCOM regulator. Maximum Inlet Pressure 3500 psig / 241 bar. Operating Temperature PCTFE Seat: -40 C to 60 C. Flow Capacity Cv = 0.24. MEDIA CONTACT MATERIALS Body 316L Stainless Steel Electropolish. Valve Seat PTFE or PCTFE. Internal Surface Finish 10 Ra microinch. 1/4 inch face seal. Pressure rating per ANSI/ASME B31.3. Inboard Leak Rate < 1 x 10-9 atm cc/sec He" }], "cat-regulator");
  assert.ok(Math.abs(result.maxPressureMpa - 24.1) < 0.05);
  assert.equal(result.minTemperatureC, -40);
  assert.equal(result.maxTemperatureC, 60);
  assert.ok(result.wettedMaterials.includes("316L stainless steel"));
  assert.match(result.connectionStandard, /face seal/i);
  assert.equal(result.specifications.cv, 0.24);
  assert.ok(Math.abs(result.specifications.inletPressureRating - 24.1) < 0.05);
  assert.deepEqual(result.sourcePages, [1]);
});

test("extracts fire detector electrical and functional parameters", () => {
  const result = extractCatalogTechnicalData([{ page: 3, text: "FSL100 SERIES FLAME DETECTORS. Range 110 ft / 35 m IR3. Cone of vision 90 degree minimum. Power 10-28 VDC. Standard available 4-20 mA. Alarm relay and Fault relay. Alarm response time 8 to 30 sec. Automatic Self-Test. IP66. ATEX IECEx CE." }], "cat-fire-detector");
  assert.equal(result.supplyVoltage, "10-28 VDC");
  assert.equal(result.signalProtocol, "4-20 mA");
  assert.equal(result.ingressProtection, "IP66");
  assert.equal(result.specifications.selfTest, true);
  assert.match(String(result.specifications.detectionRange), /35 m/i);
  assert.ok(result.certifications.includes("ATEX"));
});


test("uses APTech order-code options instead of unrelated family maxima", () => {
  const result = extractCatalogTechnicalData([{ page: 1, text: "Source pressure AP 1200 HF vacuum to 1,700 psig (117 bar). AP 1200 HR vacuum to 3,000 psig (207 bar). Operating temperature -40 to +71 C. Flow rates standard to 800 slpm, HF option to 1,000 slpm. FV8 = 1/2 inch face seal female. MV4 = 1/4 inch face seal male." }], "cat-regulator", "AP1210SM-2PW-FV8-FV8-HF");
  assert.equal(result.maxPressureMpa, 11.7);
  assert.equal(result.minTemperatureC, -40);
  assert.equal(result.maxTemperatureC, 71);
  assert.equal(result.nominalSize, "1/2 inch");
  assert.equal(result.maxFlow, 1000);
  assert.equal(result.connectionStandard, "face seal female");
});
