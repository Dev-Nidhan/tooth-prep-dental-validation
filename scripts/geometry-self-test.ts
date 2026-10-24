import { readFileSync } from "node:fs";
import { buildReport } from "../src/lib/clinical";
import { analyzeTriangles } from "../src/lib/geometry";
import { parseStl } from "../src/lib/stl";

function load(path: string) {
  const buf = readFileSync(path);
  const array = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return parseStl(array);
}

function expectClose(name: string, value: number, target: number, tol: number) {
  if (Math.abs(value - target) > tol) {
    throw new Error(`${name}: got ${value.toFixed(3)}, expected ${target} ± ${tol}`);
  }
  console.log(`ok ${name}: ${value.toFixed(2)}`);
}

const ideal = analyzeTriangles(load("public/demos/ideal-12.stl"));
expectClose("ideal TOC", ideal.totalOcclusalConvergenceDeg, 12, 1.5);
expectClose("ideal height", ideal.axialWallHeightMm, 4.2, 0.5);
if (ideal.undercutMm > 0.08) throw new Error(`ideal undercut ${ideal.undercutMm}`);

const rotated = analyzeTriangles(load("public/demos/rotated-12.stl"));
expectClose("rotated TOC", rotated.totalOcclusalConvergenceDeg, 12, 1.8);
expectClose("rotated height", rotated.axialWallHeightMm, 4.2, 0.55);

const onDie = analyzeTriangles(load("public/demos/ideal-on-die.stl"));
expectClose("die TOC", onDie.totalOcclusalConvergenceDeg, 12, 2);
expectClose("die height", onDie.axialWallHeightMm, 4.2, 0.75);
if (onDie.undercutMm > 0.1) throw new Error(`die undercut ${onDie.undercutMm}`);

const steep = analyzeTriangles(load("public/demos/overtapered-28.stl"));
expectClose("overtaper TOC", steep.totalOcclusalConvergenceDeg, 28, 2);

const bulged = analyzeTriangles(load("public/demos/undercut-buccal.stl"));
if (bulged.undercutMm < 0.15) throw new Error(`undercut not detected: ${bulged.undercutMm}`);
console.log(`ok undercut detected: ${bulged.undercutMm.toFixed(2)} mm`);

const report = buildReport({
  geometry: steep,
  tooth: 36,
  material: "lithium_disilicate",
  taperDeg: null,
  occlusalMm: 1.1,
  axialMm: 1.2,
  finishMm: 1.0,
  heightMm: null,
});
const byId = Object.fromEntries(report.parameters.map((item) => [item.id, item.status]));
if (byId.toc !== "fail") throw new Error(`TOC status ${byId.toc}`);
if (byId.occlusal !== "fail") throw new Error(`occlusal status ${byId.occlusal}`);
if (report.overall !== "rework") throw new Error(`overall ${report.overall}`);
console.log("ok clinical report flags overtaper and light occlusal reduction");

const idealReport = buildReport({
  geometry: ideal,
  tooth: 36,
  material: "lithium_disilicate",
  taperDeg: null,
  occlusalMm: 1.8,
  axialMm: 1.2,
  finishMm: 1.0,
  heightMm: null,
});
if (idealReport.overall !== "meets") {
  console.error(idealReport.parameters);
  throw new Error(`ideal overall ${idealReport.overall}`);
}
console.log("ok ideal teaching model meets the ranges");
console.log("browser geometry self-test passed");
