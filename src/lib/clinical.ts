import type { MeshGeometry } from "@/lib/geometry";

export type MaterialId =
  | "full_metal"
  | "pfm"
  | "monolithic_zirconia"
  | "layered_zirconia"
  | "lithium_disilicate"
  | "feldspathic";

export type ParameterStatus = "pass" | "caution" | "fail" | "missing";
export type Overall = "meets" | "review" | "rework" | "incomplete";
export type ReadingSource = "scan" | "entered" | "photo";

export type Parameter = {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  target: string;
  status: ParameterStatus;
  source: ReadingSource | null;
  note: string;
};

export type ClinicalReport = {
  toothFdi: number | null;
  toothGroup: "anterior" | "premolar" | "molar" | null;
  material: MaterialId;
  materialLabel: string;
  finishLine: string;
  overall: Overall;
  summary: string;
  parameters: Parameter[];
  photoNotes: string[];
  geometryNotes: string[];
  disclaimer: string;
};

type Band = { idealMin: number; idealMax: number; acceptMin: number; acceptMax: number };

const RANGES: Record<MaterialId, { occlusal: Band; axial: Band; finish: Band }> = {
  full_metal: {
    occlusal: { idealMin: 1, idealMax: 1.5, acceptMin: 0.8, acceptMax: 1.8 },
    axial: { idealMin: 0.5, idealMax: 1, acceptMin: 0.4, acceptMax: 1.3 },
    finish: { idealMin: 0.3, idealMax: 0.5, acceptMin: 0.3, acceptMax: 0.7 },
  },
  pfm: {
    occlusal: { idealMin: 1.5, idealMax: 2, acceptMin: 1.3, acceptMax: 2.4 },
    axial: { idealMin: 1.2, idealMax: 1.5, acceptMin: 1, acceptMax: 1.8 },
    finish: { idealMin: 1, idealMax: 1.3, acceptMin: 0.8, acceptMax: 1.5 },
  },
  monolithic_zirconia: {
    occlusal: { idealMin: 1, idealMax: 1.5, acceptMin: 0.8, acceptMax: 2 },
    axial: { idealMin: 0.8, idealMax: 1.2, acceptMin: 0.6, acceptMax: 1.5 },
    finish: { idealMin: 0.5, idealMax: 1, acceptMin: 0.4, acceptMax: 1.2 },
  },
  layered_zirconia: {
    occlusal: { idealMin: 1.5, idealMax: 2, acceptMin: 1.3, acceptMax: 2.4 },
    axial: { idealMin: 1.2, idealMax: 1.5, acceptMin: 1, acceptMax: 1.8 },
    finish: { idealMin: 1, idealMax: 1.2, acceptMin: 0.8, acceptMax: 1.5 },
  },
  lithium_disilicate: {
    occlusal: { idealMin: 1.5, idealMax: 2, acceptMin: 1.3, acceptMax: 2.3 },
    axial: { idealMin: 1, idealMax: 1.5, acceptMin: 0.8, acceptMax: 1.8 },
    finish: { idealMin: 1, idealMax: 1.2, acceptMin: 0.8, acceptMax: 1.4 },
  },
  feldspathic: {
    occlusal: { idealMin: 1.5, idealMax: 2, acceptMin: 1.5, acceptMax: 2.4 },
    axial: { idealMin: 1, idealMax: 1.5, acceptMin: 1, acceptMax: 1.8 },
    finish: { idealMin: 1, idealMax: 1.2, acceptMin: 0.9, acceptMax: 1.5 },
  },
};

export const MATERIALS: { id: MaterialId; label: string; finish: string; blurb: string }[] = [
  { id: "lithium_disilicate", label: "Lithium disilicate", finish: "shoulder or heavy chamfer", blurb: "e.max-style glass ceramic. Needs a definite margin and about 1.5–2 mm occlusally." },
  { id: "monolithic_zirconia", label: "Monolithic zirconia", finish: "chamfer", blurb: "Can be a little more conservative than layered ceramic. Still needs a readable finish line." },
  { id: "layered_zirconia", label: "Layered zirconia", finish: "heavy chamfer or shoulder", blurb: "Cut like a porcelain-fused crown where the ceramic will be stacked." },
  { id: "pfm", label: "Porcelain fused to metal", finish: "shoulder or heavy chamfer", blurb: "Facial shoulder, more room on the functional cusp." },
  { id: "full_metal", label: "Full metal", finish: "light chamfer", blurb: "The most conservative complete-crown cut. A knife edge is still a poor plan." },
  { id: "feldspathic", label: "Feldspathic porcelain", finish: "rounded shoulder", blurb: "Least forgiving of a thin occlusal or a skinny margin." },
];

export const DISCLAIMER =
  "Teaching aid only. Not a medical device. Confirm reduction with a periodontal probe or a calibrated scanner, and follow your program's rubric, before you temporize or cement.";

export function teachingBands(id: MaterialId) {
  return RANGES[id];
}

export function materialById(id: MaterialId) {
  return MATERIALS.find((item) => item.id === id) ?? MATERIALS[0];
}

export function toothGroup(fdi: number): "anterior" | "premolar" | "molar" {
  const quadrant = Math.floor(fdi / 10);
  const digit = fdi % 10;
  if (quadrant < 1 || quadrant > 4 || digit < 1 || digit > 8) {
    throw new Error(`FDI ${fdi} is not a permanent tooth.`);
  }
  if (digit <= 3) return "anterior";
  if (digit <= 5) return "premolar";
  return "molar";
}

export function toothLabel(fdi: number): string {
  const names = ["", "central incisor", "lateral incisor", "canine", "first premolar", "second premolar", "first molar", "second molar", "third molar"];
  const arches = ["", "maxillary right", "maxillary left", "mandibular left", "mandibular right"];
  const quadrant = Math.floor(fdi / 10);
  const digit = fdi % 10;
  if (!names[digit] || !arches[quadrant]) return `FDI ${fdi}`;
  return `${arches[quadrant]} ${names[digit]}`;
}

function fmt(value: number, digits = 1): string {
  return value.toFixed(digits);
}

function bandStatus(value: number, band: Band): ParameterStatus {
  if (value >= band.idealMin && value <= band.idealMax) return "pass";
  if (value >= band.acceptMin && value <= band.acceptMax) return "caution";
  return "fail";
}

function tocStatus(toc: number): ParameterStatus {
  if (toc >= 6 && toc <= 12) return "pass";
  if ((toc > 12 && toc <= 20) || (toc >= 4 && toc < 6) || (toc > 20 && toc <= 25)) return "caution";
  return "fail";
}

function heightStatus(height: number, group: "anterior" | "premolar" | "molar", source: ReadingSource): ParameterStatus {
  const slack = source === "scan" ? 0.2 : 0;
  if (group === "molar") {
    if (height + slack >= 4) return "pass";
    if (height >= 3) return "caution";
    return "fail";
  }
  if (height + slack >= 3) return "pass";
  if (height >= 2.5) return "caution";
  return "fail";
}

function ratioStatus(ratio: number): ParameterStatus {
  if (ratio >= 0.4) return "pass";
  if (ratio >= 0.3) return "caution";
  return "fail";
}

function missing(id: string, label: string, unit: string, target: string, note: string): Parameter {
  return { id, label, value: null, unit, target, status: "missing", source: null, note };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildReport(input: {
  geometry: MeshGeometry | null;
  tooth: number | null;
  material: MaterialId;
  taperDeg: number | null;
  occlusalMm: number | null;
  axialMm: number | null;
  finishMm: number | null;
  heightMm: number | null;
  sources?: Partial<Record<"occlusal" | "axial" | "finish", ReadingSource>>;
  photoNotes?: string[];
}): ClinicalReport {
  const material = materialById(input.material);
  const ranges = RANGES[input.material];
  const geometry = input.geometry;
  let group: ClinicalReport["toothGroup"] = null;
  if (input.tooth) group = toothGroup(input.tooth);
  const parameters: Parameter[] = [];

  const tocValue = input.taperDeg ?? (geometry ? geometry.totalOcclusalConvergenceDeg : null);
  const tocSource: ReadingSource = input.taperDeg != null ? "entered" : "scan";
  if (tocValue == null) {
    parameters.push(missing("toc", "Total occlusal convergence", "deg", "6–12° optimal, up to 20° acceptable", "Load a preparation STL or type the angle you measured."));
  } else {
    let status = tocStatus(tocValue);
    if (geometry && geometry.confidence === "low" && input.taperDeg == null && status === "pass") status = "caution";
    const scanBit =
      geometry && input.taperDeg != null
        ? ` The scan estimate was ${fmt(geometry.totalOcclusalConvergenceDeg)}°.`
        : "";
    let note: string;
    if (status === "pass" && !(geometry && geometry.confidence === "low" && input.taperDeg == null)) {
      note = "Within the textbook taper. Retention is favoured if the walls are long enough.";
    } else if (tocValue < 6) {
      note = "Very parallel. Look for undercuts and check that the crown seats without binding.";
    } else if (tocValue <= 20) {
      note = "Inside the 10–20° clinical range described by Goodacre, Campagni, and Aquilino (J Prosthet Dent 2001).";
    } else if (tocValue <= 25) {
      note = "Retention is thinning. Grooves, boxes, or an adhesive plan are worth considering.";
    } else {
      note = "Too tapered for reliable cement retention on this path. Reduce the convergence or add resistance features.";
    }
    if (geometry && geometry.confidence === "low" && input.taperDeg == null && tocValue >= 6 && tocValue <= 12) {
      note = "The number sits in the optimal band, but the mesh fit was weak. Confirm the angle on the die.";
    }
    parameters.push({
      id: "toc",
      label: "Total occlusal convergence",
      value: round2(tocValue),
      unit: "deg",
      target: "6–12° optimal, up to 20° acceptable",
      status,
      source: tocSource,
      note: note + scanBit,
    });
  }

  const heightValue = input.heightMm ?? (geometry ? geometry.axialWallHeightMm : null);
  if (heightValue == null || !group) {
    parameters.push(missing("wall_height", "Axial wall height", "mm", "≥ 4 mm molars, ≥ 3 mm other teeth", "Choose a tooth and load a scan, or type the height."));
  } else {
    const source: ReadingSource = input.heightMm != null ? "entered" : "scan";
    const status = heightStatus(heightValue, group, source);
    const target = group === "molar" ? "≥ 4 mm" : "≥ 3 mm";
    const floor = group === "molar" ? 4 : 3;
    let note: string;
    if (status === "pass" && heightValue < floor) {
      note = `Measured ${fmt(heightValue)} mm, inside the scan tolerance of the ${target} guide for a ${group}.`;
    } else if (status === "pass") {
      note = `Meets the ${target} occlusocervical guide for a ${group}.`;
    } else if (status === "caution") {
      note = "Shorter than the usual target. Resistance form depends on grooves, a ferrule plan, or adhesive cement.";
    } else {
      note = "Too short for dependable resistance form on a cement-retained crown.";
    }
    parameters.push({
      id: "wall_height",
      label: "Axial wall height",
      value: round2(heightValue),
      unit: "mm",
      target,
      status,
      source,
      note,
    });
  }

  if (!geometry) {
    parameters.push(missing("ratio", "Height-to-width ratio", "ratio", "≥ 0.4", "Comes from the preparation mesh (occlusocervical height ÷ margin diameter)."));
    parameters.push(missing("undercut", "Path of insertion", "mm", "No wall wider toward the occlusal", "Comes from the preparation mesh."));
  } else {
    const status = ratioStatus(geometry.heightToWidth);
    parameters.push({
      id: "ratio",
      label: "Height-to-width ratio",
      value: round2(geometry.heightToWidth),
      unit: "ratio",
      target: "≥ 0.4",
      status,
      source: "scan",
      note:
        status === "pass"
          ? "Occlusocervical dimension divided by the margin diameter. Goodacre and colleagues used 0.4 as the resistance-form floor."
          : "Below 0.4 the preparation resists displacement poorly, even when the taper looks modest.",
    });
    const underStatus: ParameterStatus =
      geometry.undercutMm >= 0.12 ? "fail" : geometry.undercutMm >= 0.08 ? "caution" : "pass";
    parameters.push({
      id: "undercut",
      label: "Path of insertion",
      value: round2(geometry.undercutMm),
      unit: "mm",
      target: "No wall wider toward the occlusal",
      status: underStatus,
      source: "scan",
      note:
        underStatus === "pass"
          ? "No sector gets wider as it runs toward the occlusal table."
          : "At least one sector bulges toward the occlusal. The crown will bind or rock unless that wall is relieved or the path changes.",
    });
  }

  appendMm(parameters, "occlusal", "Occlusal reduction", input.occlusalMm, ranges.occlusal, input.sources?.occlusal ?? "entered", {
    low: "Thin occlusal reduction leaves too little room for the material.",
    high: "Heavy occlusal reduction. Re-check the remaining dentine and the pulp.",
    ok: "Enough room for the chosen material on the teaching range.",
    missing: "Type a probe reading, or calibrate a photo with a probe mark or a bur of known diameter.",
  });
  appendMm(parameters, "axial", "Axial reduction", input.axialMm, ranges.axial, input.sources?.axial ?? "entered", {
    low: "Axial reduction is light for this material. The contour will be bulky or the ceramic thin.",
    high: "Axial reduction is heavy. Retention gets shorter as the stump narrows.",
    ok: "Axial room matches the teaching range for this material.",
    missing: "Type a probe reading, or calibrate a photo with a probe mark or a bur of known diameter.",
  });
  appendMm(parameters, "finish", "Finish-line width", input.finishMm, ranges.finish, input.sources?.finish ?? "entered", {
    low: "The finish line is narrow for this material.",
    high: "The finish line is wider than this material needs.",
    ok: `Width suits a ${material.finish}.`,
    missing: `For this material the teaching finish line is a ${material.finish}. Measure it on a calibrated photo or with a probe.`,
  });

  let overall: Overall;
  let summary: string;
  if (parameters.some((item) => item.status === "fail")) {
    overall = "rework";
    summary = "One or more parameters are outside the range. Rework the preparation before the impression.";
  } else if (parameters.some((item) => item.status === "missing")) {
    if (parameters.some((item) => item.status === "caution")) {
      overall = "review";
      summary = "Some findings need a second look, and the check is still missing measurements.";
    } else {
      overall = "incomplete";
      summary = "Nothing has failed. Reduction or finish-line width is still missing, so this is not a complete check.";
    }
  } else if (parameters.some((item) => item.status === "caution")) {
    overall = "review";
    summary = "Nothing has failed outright. Review the caution items before you take the impression.";
  } else {
    overall = "meets";
    summary = "Taper, wall height, reduction, and finish line are inside the teaching ranges.";
  }

  return {
    toothFdi: input.tooth,
    toothGroup: group,
    material: input.material,
    materialLabel: material.label,
    finishLine: material.finish,
    overall,
    summary,
    parameters,
    photoNotes: input.photoNotes ?? [],
    geometryNotes: geometry?.notes ?? [],
    disclaimer: DISCLAIMER,
  };
}

function appendMm(
  parameters: Parameter[],
  id: string,
  label: string,
  value: number | null,
  band: Band,
  source: ReadingSource,
  copy: { low: string; high: string; ok: string; missing: string },
) {
  const target = `${fmt(band.idealMin)}–${fmt(band.idealMax)} mm (acceptable ${fmt(band.acceptMin)}–${fmt(band.acceptMax)})`;
  if (value == null) {
    parameters.push(missing(id, label, "mm", target, copy.missing));
    return;
  }
  const status = bandStatus(value, band);
  parameters.push({
    id,
    label,
    value: round2(value),
    unit: "mm",
    target,
    status,
    source,
    note: status === "pass" ? copy.ok : value < band.idealMin ? copy.low : copy.high,
  });
}

export function reportPlainText(report: ClinicalReport, note: string): string {
  const lines = [
    "Finish Line — crown preparation check",
    report.toothFdi ? `Tooth FDI ${report.toothFdi} (${toothLabel(report.toothFdi)})` : "Tooth not selected",
    `Material: ${report.materialLabel}`,
    `Finish line taught for this material: ${report.finishLine}`,
    `Verdict: ${overallLabel(report.overall)}`,
    report.summary,
    "",
  ];
  for (const item of report.parameters) {
    const value = item.value == null ? "—" : item.unit === "deg" ? `${item.value.toFixed(1)}°` : item.unit === "ratio" ? item.value.toFixed(2) : `${item.value.toFixed(2)} mm`;
    lines.push(`${item.label}: ${value}`);
    lines.push(`  Target: ${item.target}`);
    lines.push(`  ${statusLabel(item.status)}${item.source ? ` · ${item.source}` : ""}`);
    lines.push(`  ${item.note}`);
  }
  if (note.trim()) {
    lines.push("", `Note: ${note.trim()}`);
  }
  if (report.photoNotes.length) {
    lines.push("", "Photos:", ...report.photoNotes.map((item) => `  ${item}`));
  }
  lines.push("", report.disclaimer);
  return lines.join("\n");
}

export function overallLabel(overall: Overall): string {
  if (overall === "meets") return "Meets the teaching ranges";
  if (overall === "review") return "Review before the impression";
  if (overall === "rework") return "Rework recommended";
  return "Still missing measurements";
}

export function statusLabel(status: ParameterStatus): string {
  if (status === "pass") return "Meets";
  if (status === "caution") return "Borderline";
  if (status === "fail") return "Outside";
  return "Needed";
}
