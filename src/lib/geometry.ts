import { normalize, triangleFromVerts, type Triangle, type Vec3 } from "@/lib/stl";

/**
 * Preparation geometry. The numeric thresholds match python/crown_prep.py.
 * Change them in both places.
 *
 * The insertion axis is the direction that makes the axial walls a clean cone
 * and keeps undercuts small. Total occlusal convergence is twice the angle
 * at which the radius shrinks toward the occlusal table. A sector is an
 * undercut when its radius rises on the way to the occlusal.
 */

const AXIAL_NORMAL_MAX = 0.58;
const CAP_NORMAL_MIN = 0.75;
const PROFILE_STEP_MM = 0.3;
const OCCLUSAL_SKIP_MM = 0.35;
const MARGIN_RESIDUAL_MM = 0.22;
const MIN_PROFILE_BINS = 4;
const MIN_BIN_POINTS = 4;
const WINDOW_BELOW_OCCLUSAL_MM = 8;
const MAX_SAMPLES = 4500;

const OPTIMAL: Vec3 = [0.122, 0.478, 0.302];
const WARNING: Vec3 = [0.647, 0.42, 0.071];
const CRITICAL: Vec3 = [0.769, 0.396, 0.29];
const IVORY: Vec3 = [0.91, 0.855, 0.78];
const STONE: Vec3 = [0.72, 0.69, 0.64];

export type SectorReading = {
  index: number;
  startDeg: number;
  wallDeg: number;
  undercutMm: number;
};

export type MeshGeometry = {
  axis: Vec3;
  totalOcclusalConvergenceDeg: number;
  meanWallDeg: number;
  axialWallHeightMm: number;
  marginDiameterMm: number;
  occlusalDiameterMm: number;
  heightToWidth: number;
  rSquared: number;
  undercutMm: number;
  sectors: SectorReading[];
  capFound: boolean;
  confidence: "high" | "moderate" | "low";
  notes: string[];
  positions: Float32Array;
  colors: Float32Array;
};

type Oriented = {
  axis: Vec3;
  toc: number;
  meanWall: number;
  wallHeight: number;
  marginDiameter: number;
  occlusalDiameter: number;
  ratio: number;
  r2: number;
  undercut: number;
  sectors: SectorReading[];
  capFound: boolean;
  confidence: "high" | "moderate" | "low";
  score: number;
  center: Vec3;
  hOcc: number;
  hMargin: number;
};

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function mul(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function len(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[mid] : 0.5 * (ordered[mid - 1] + ordered[mid]);
}
function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  if (ordered.length === 1) return ordered[0];
  const rank = (ordered.length - 1) * (pct / 100);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return ordered[lo];
  return ordered[lo] * (hi - rank) + ordered[hi] * (rank - lo);
}
function linreg(xs: number[], ys: number[]): [number, number, number] {
  const n = xs.length;
  if (n < 2) return [0, ys[0] ?? 0, 0];
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (xs[i] - meanX) ** 2;
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
  }
  if (sxx < 1e-9) return [0, meanY, 0];
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  let sst = 0;
  let residual = 0;
  for (let i = 0; i < n; i += 1) {
    sst += (ys[i] - meanY) ** 2;
    const pred = intercept + slope * xs[i];
    residual += (ys[i] - pred) ** 2;
  }
  const r2 = sst > 1e-9 ? 1 - residual / sst : 1;
  return [slope, intercept, Math.max(-1, Math.min(1, r2))];
}
function rotate(vector: Vec3, axis: Vec3, degrees: number): Vec3 {
  const k = normalize(axis);
  const theta = (degrees * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return add(add(mul(vector, cosT), mul(cross(k, vector), sinT)), mul(k, dot(k, vector) * (1 - cosT)));
}
function basis(u: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const xAxis = normalize(cross(u, helper));
  return [xAxis, cross(u, xAxis)];
}
function heightOf(point: Vec3, center: Vec3, axis: Vec3): number {
  return dot(sub(point, center), axis);
}
function undercutDepth(bins: [number, number][]): number {
  if (bins.length < 2) return 0;
  const ordered = [...bins].sort((a, b) => a[0] - b[0]);
  let runningMin = ordered[0][1];
  let worst = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const radius = ordered[i][1];
    if (radius > runningMin) worst = Math.max(worst, radius - runningMin);
    else runningMin = radius;
  }
  return worst;
}

function downsample(triangles: Triangle[]): Triangle[] {
  if (triangles.length <= MAX_SAMPLES) return triangles;
  const stride = Math.ceil(triangles.length / MAX_SAMPLES);
  const out: Triangle[] = [];
  for (let i = 0; i < triangles.length; i += stride) out.push(triangles[i]);
  return out;
}

function centroidOf(triangles: Triangle[]): Vec3 {
  let area = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const tri of triangles) {
    area += tri.area;
    x += tri.centroid[0] * tri.area;
    y += tri.centroid[1] * tri.area;
    z += tri.centroid[2] * tri.area;
  }
  const w = area || 1;
  return [x / w, y / w, z / w];
}

function principalAxes(triangles: Triangle[], center: Vec3): Vec3[] {
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  let weight = 0;
  for (const tri of triangles) {
    const d = sub(tri.centroid, center);
    weight += tri.area;
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) cov[i][j] += tri.area * d[i] * d[j];
    }
  }
  if (weight <= 0) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) cov[i][j] /= weight;
  }
  const matrix = cov.map((row) => [...row]);
  const vectors = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let iter = 0; iter < 16; iter += 1) {
    let p = 0;
    let q = 1;
    let best = Math.abs(matrix[0][1]);
    for (const pair of [
      [0, 2],
      [1, 2],
    ] as const) {
      if (Math.abs(matrix[pair[0]][pair[1]]) > best) {
        best = Math.abs(matrix[pair[0]][pair[1]]);
        p = pair[0];
        q = pair[1];
      }
    }
    if (best < 1e-12) break;
    const app = matrix[p][p];
    const aqq = matrix[q][q];
    const apq = matrix[p][q];
    const phi = Math.abs(aqq - app) > 1e-15 ? Math.atan2(2 * apq, aqq - app) * 0.5 : Math.PI / 4;
    const cosT = Math.cos(phi);
    const sinT = Math.sin(phi);
    for (let i = 0; i < 3; i += 1) {
      const aip = matrix[i][p];
      const aiq = matrix[i][q];
      matrix[i][p] = cosT * aip - sinT * aiq;
      matrix[i][q] = sinT * aip + cosT * aiq;
    }
    for (let j = 0; j < 3; j += 1) {
      const apj = matrix[p][j];
      const aqj = matrix[q][j];
      matrix[p][j] = cosT * apj - sinT * aqj;
      matrix[q][j] = sinT * apj + cosT * aqj;
    }
    for (let i = 0; i < 3; i += 1) {
      const vip = vectors[i][p];
      const viq = vectors[i][q];
      vectors[i][p] = cosT * vip - sinT * viq;
      vectors[i][q] = sinT * vip + cosT * viq;
    }
  }
  return [0, 1, 2].map((k) => normalize([vectors[0][k], vectors[1][k], vectors[2][k]]));
}

function fibonacci(n: number): Vec3[] {
  const points: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i += 1) {
    const y = 1 - i / Math.max(n - 1, 1);
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    points.push([Math.cos(theta) * radius, y, Math.sin(theta) * radius]);
  }
  return points;
}

function scaleTriangles(triangles: Triangle[]): { triangles: Triangle[]; note: string | null } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const tri of triangles) {
    minX = Math.min(minX, tri.centroid[0]);
    minY = Math.min(minY, tri.centroid[1]);
    minZ = Math.min(minZ, tri.centroid[2]);
    maxX = Math.max(maxX, tri.centroid[0]);
    maxY = Math.max(maxY, tri.centroid[1]);
    maxZ = Math.max(maxZ, tri.centroid[2]);
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  let factor = 1;
  let note: string | null = null;
  if (span > 150) {
    factor = 0.001;
    note = "Mesh extent looked like micrometres, so coordinates were divided by 1000.";
  } else if (span < 0.2) {
    factor = 1000;
    note = "Mesh extent looked like metres, so coordinates were multiplied by 1000.";
  }
  if (factor === 1) return { triangles, note: null };
  const scaled: Triangle[] = [];
  for (const tri of triangles) {
    const verts = tri.verts.map((v) => mul(v, factor) as Vec3) as [Vec3, Vec3, Vec3];
    const rebuilt = triangleFromVerts(verts[0], verts[1], verts[2]);
    if (rebuilt) scaled.push(rebuilt);
  }
  return { triangles: scaled, note };
}

function evaluateOriented(samples: Triangle[], center: Vec3, rawAxis: Vec3): Oriented | null {
  const axis = normalize(rawAxis);
  const caps = samples.filter((tri) => dot(tri.normal, axis) > CAP_NORMAL_MIN);
  const heights = samples.map((tri) => heightOf(tri.centroid, center, axis));
  let capFound = false;
  let hOcc = percentile(heights, 97);
  if (caps.length >= 8) {
    const capHeights = caps.map((tri) => heightOf(tri.centroid, center, axis));
    const highest = Math.max(...capHeights);
    const top = capHeights.filter((h) => h >= highest - 1);
    if (top.length >= 6) {
      hOcc = median(top);
      capFound = true;
    }
  }

  const [xAxis, yAxis] = basis(axis);
  const axial: [number, number, number][] = [];
  for (const tri of samples) {
    if (Math.abs(dot(tri.normal, axis)) > AXIAL_NORMAL_MAX) continue;
    const h = heightOf(tri.centroid, center, axis);
    if (h > hOcc - OCCLUSAL_SKIP_MM || h < hOcc - WINDOW_BELOW_OCCLUSAL_MM) continue;
    const offset = sub(tri.centroid, center);
    const radialVec = sub(offset, mul(axis, h));
    const theta = Math.atan2(dot(radialVec, yAxis), dot(radialVec, xAxis));
    axial.push([h, len(radialVec), theta]);
  }
  if (axial.length < 40) return null;

  const bins = new Map<number, number[]>();
  for (const [h, radius] of axial) {
    const key = Math.round((hOcc - h) / PROFILE_STEP_MM);
    const list = bins.get(key);
    if (list) list.push(radius);
    else bins.set(key, [radius]);
  }
  const profile: [number, number][] = [];
  for (const key of [...bins.keys()].sort((a, b) => a - b)) {
    const values = bins.get(key)!;
    if (values.length < MIN_BIN_POINTS) continue;
    profile.push([hOcc - key * PROFILE_STEP_MM, median(values)]);
  }
  profile.sort((a, b) => b[0] - a[0]);
  if (profile.length < MIN_PROFILE_BINS) return null;

  let start = MIN_PROFILE_BINS;
  while (start < profile.length) {
    const window = profile.slice(0, start + 1);
    const [slope, intercept, r2] = linreg(
      window.map((item) => item[0]),
      window.map((item) => item[1]),
    );
    const [hNext, rNext] = profile[start];
    if (Math.abs(rNext - (intercept + slope * hNext)) > MARGIN_RESIDUAL_MM || r2 < 0.75) break;
    start += 1;
  }
  const window = profile.slice(0, start);
  if (window.length < MIN_PROFILE_BINS) return null;
  const xs = window.map((item) => item[0]);
  const ys = window.map((item) => item[1]);
  const [slope, intercept, r2] = linreg(xs, ys);
  const hMargin = Math.min(...xs);
  const hTop = Math.max(...xs);
  if (hTop - hMargin < 1.2) return null;
  const wallHeight = hOcc - hMargin;
  const toc = ((Math.atan(-slope) * 180) / Math.PI) * 2;
  const rMargin = intercept + slope * hMargin;
  const rOcclusal = intercept + slope * hOcc;
  if (rMargin < 0.4 || wallHeight > 12 || wallHeight < 1.2) return null;

  const sectors: SectorReading[] = [];
  let worst = 0;
  const wallAngles: number[] = [];
  for (let index = 0; index < 8; index += 1) {
    const lo = -Math.PI + index * (Math.PI / 4);
    const hi = lo + Math.PI / 4;
    const points = axial.filter(
      ([h, , theta]) => h >= hMargin - 0.05 && h <= hOcc - OCCLUSAL_SKIP_MM && theta >= lo && theta < hi,
    );
    const startDeg = (((lo * 180) / Math.PI) % 360 + 360) % 360;
    if (points.length < 8) {
      sectors.push({ index, startDeg, wallDeg: toc / 2, undercutMm: 0 });
      continue;
    }
    const sectorBins = new Map<number, number[]>();
    for (const [h, radius] of points) {
      const key = Math.round(h / PROFILE_STEP_MM);
      const list = sectorBins.get(key);
      if (list) list.push(radius);
      else sectorBins.set(key, [radius]);
    }
    const ordered: [number, number][] = [];
    for (const key of [...sectorBins.keys()].sort((a, b) => a - b)) {
      const values = sectorBins.get(key)!;
      if (values.length >= 2) ordered.push([key * PROFILE_STEP_MM, median(values)]);
    }
    if (ordered.length < 3) {
      sectors.push({ index, startDeg, wallDeg: toc / 2, undercutMm: 0 });
      continue;
    }
    const [sectorSlope] = linreg(
      ordered.map((item) => item[0]),
      ordered.map((item) => item[1]),
    );
    const wall = (Math.atan(-sectorSlope) * 180) / Math.PI;
    const depth = undercutDepth(ordered);
    worst = Math.max(worst, depth);
    wallAngles.push(wall);
    sectors.push({ index, startDeg, wallDeg: wall, undercutMm: depth });
  }

  const meanWall = wallAngles.length ? wallAngles.reduce((s, v) => s + v, 0) / wallAngles.length : toc / 2;
  const marginDiameter = Math.max(rMargin, 0.2) * 2;
  let confidence: Oriented["confidence"] = "low";
  if (r2 >= 0.9 && capFound && window.length >= 6) confidence = "high";
  else if (r2 >= 0.7) confidence = "moderate";

  let score = r2 * 5;
  if (capFound) score += 1.1;
  if (wallHeight >= 2 && wallHeight <= 8) score += 0.9;
  if (toc >= 2 && toc <= 45) score += 0.6;
  score -= Math.min(worst, 3) * 0.15;
  if (toc < -8 || toc > 80) score -= 3;
  if (slope < 0) score += 0.4;

  return {
    axis,
    toc,
    meanWall,
    wallHeight,
    marginDiameter,
    occlusalDiameter: Math.max(rOcclusal, 0) * 2,
    ratio: marginDiameter ? wallHeight / marginDiameter : 0,
    r2,
    undercut: worst,
    sectors,
    capFound,
    confidence,
    score,
    center,
    hOcc,
    hMargin,
  };
}

function better(current: Oriented | null, challenger: Oriented | null): Oriented | null {
  if (!challenger) return current;
  if (!current || challenger.score > current.score) return challenger;
  return current;
}

function evaluateBoth(samples: Triangle[], center: Vec3, axis: Vec3): Oriented | null {
  return better(evaluateOriented(samples, center, axis), evaluateOriented(samples, center, mul(axis, -1)));
}

function tone(sector: SectorReading): Vec3 {
  if (sector.undercutMm >= 0.12) return CRITICAL;
  if (sector.wallDeg < 2 || sector.wallDeg > 12.5) return WARNING;
  return OPTIMAL;
}

function paint(triangles: Triangle[], fit: Oriented): { positions: Float32Array; colors: Float32Array } {
  const positions = new Float32Array(triangles.length * 9);
  const colors = new Float32Array(triangles.length * 9);
  const [xAxis, yAxis] = basis(fit.axis);
  for (let i = 0; i < triangles.length; i += 1) {
    const tri = triangles[i];
    for (let v = 0; v < 3; v += 1) {
      const base = i * 9 + v * 3;
      positions[base] = tri.verts[v][0];
      positions[base + 1] = tri.verts[v][1];
      positions[base + 2] = tri.verts[v][2];
    }
    let rgb = STONE;
    const alignment = dot(tri.normal, fit.axis);
    if (alignment > CAP_NORMAL_MIN) rgb = IVORY;
    else if (Math.abs(alignment) <= AXIAL_NORMAL_MAX) {
      const h = heightOf(tri.centroid, fit.center, fit.axis);
      const offset = sub(tri.centroid, fit.center);
      const radialVec = sub(offset, mul(fit.axis, h));
      const theta = Math.atan2(dot(radialVec, yAxis), dot(radialVec, xAxis));
      let index = Math.floor((theta + Math.PI) / (Math.PI / 4));
      if (index < 0) index = 0;
      if (index > 7) index = 7;
      rgb = tone(fit.sectors[index]);
    }
    for (let v = 0; v < 3; v += 1) {
      const base = i * 9 + v * 3;
      colors[base] = rgb[0];
      colors[base + 1] = rgb[1];
      colors[base + 2] = rgb[2];
    }
  }
  return { positions, colors };
}

export function analyzeTriangles(input: Triangle[]): MeshGeometry {
  const scaled = scaleTriangles(input);
  const triangles = scaled.triangles;
  const samples = downsample(triangles);
  const center = centroidOf(samples);
  const candidates: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    ...principalAxes(samples, center),
    ...fibonacci(24),
  ];
  let best: Oriented | null = null;
  for (const axis of candidates) best = better(best, evaluateBoth(samples, center, axis));
  if (!best) {
    throw new Error("The mesh does not look like a single crown preparation. Export the prepared tooth, not a full arch.");
  }
  let axis = best.axis;
  let step = 12;
  for (let iter = 0; iter < 28 && step >= 1.5; iter += 1) {
    const [xAxis, yAxis] = basis(axis);
    let improved = false;
    for (const pivot of [xAxis, yAxis]) {
      for (const degrees of [step, -step]) {
        const trial = evaluateBoth(samples, center, normalize(rotate(axis, pivot, degrees)));
        if (trial && trial.score > best.score + 1e-4) {
          best = trial;
          axis = trial.axis;
          improved = true;
        }
      }
    }
    if (!improved) step *= 0.5;
  }

  const notes: string[] = [];
  if (scaled.note) notes.push(scaled.note);
  if (best.confidence === "low") {
    notes.push("The axial walls did not read as a clean cone. Treat the angle as a guide and confirm it on the die.");
  }
  if (!best.capFound) notes.push("No flat occlusal table was found. Height is measured from the highest surface.");
  const flagged = best.sectors.filter((sector) => sector.undercutMm >= 0.12).length;
  if (flagged) {
    notes.push(
      `${flagged} of 8 wall sectors get wider toward the occlusal, which blocks a single path of insertion.`,
    );
  }
  const painted = paint(triangles, best);
  return {
    axis: best.axis,
    totalOcclusalConvergenceDeg: best.toc,
    meanWallDeg: best.meanWall,
    axialWallHeightMm: best.wallHeight,
    marginDiameterMm: best.marginDiameter,
    occlusalDiameterMm: best.occlusalDiameter,
    heightToWidth: best.ratio,
    rSquared: best.r2,
    undercutMm: best.undercut,
    sectors: best.sectors,
    capFound: best.capFound,
    confidence: best.confidence,
    notes,
    positions: painted.positions,
    colors: painted.colors,
  };
}
