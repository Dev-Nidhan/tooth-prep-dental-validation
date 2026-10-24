export type Vec3 = [number, number, number];

export type Triangle = {
  centroid: Vec3;
  normal: Vec3;
  area: number;
  verts: [Vec3, Vec3, Vec3];
};

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: Vec3): Vec3 {
  const mag = length(a);
  if (mag < 1e-12) return [0, 0, 1];
  return [a[0] / mag, a[1] / mag, a[2] / mag];
}

export function triangleFromVerts(v1: Vec3, v2: Vec3, v3: Vec3): Triangle | null {
  const raw = cross(sub(v2, v1), sub(v3, v1));
  const area = length(raw) * 0.5;
  if (area < 1e-10) return null;
  return {
    centroid: [
      (v1[0] + v2[0] + v3[0]) / 3,
      (v1[1] + v2[1] + v3[1]) / 3,
      (v1[2] + v2[2] + v3[2]) / 3,
    ],
    normal: normalize(raw),
    area,
    verts: [v1, v2, v3],
  };
}

function isAsciiStl(data: ArrayBuffer): boolean {
  if (data.byteLength < 5) return false;
  const head = new TextDecoder().decode(data.slice(0, 5)).toLowerCase();
  if (head !== "solid") return false;
  if (data.byteLength < 84) return true;
  const count = new DataView(data).getUint32(80, true);
  return data.byteLength !== 84 + count * 50;
}

function parseBinary(data: ArrayBuffer): Triangle[] {
  if (data.byteLength < 84) {
    throw new Error("File is too small to be an STL.");
  }
  const view = new DataView(data);
  const count = view.getUint32(80, true);
  const expected = 84 + count * 50;
  if (count === 0 || count > 5_000_000 || expected > data.byteLength + 50) {
    throw new Error("This file does not look like a binary STL.");
  }
  const triangles: Triangle[] = [];
  let offset = 84;
  for (let i = 0; i < count; i += 1) {
    const v1: Vec3 = [view.getFloat32(offset + 12, true), view.getFloat32(offset + 16, true), view.getFloat32(offset + 20, true)];
    const v2: Vec3 = [view.getFloat32(offset + 24, true), view.getFloat32(offset + 28, true), view.getFloat32(offset + 32, true)];
    const v3: Vec3 = [view.getFloat32(offset + 36, true), view.getFloat32(offset + 40, true), view.getFloat32(offset + 44, true)];
    const tri = triangleFromVerts(v1, v2, v3);
    if (tri) triangles.push(tri);
    offset += 50;
  }
  if (triangles.length < 20) {
    throw new Error("The mesh has too few triangles to measure a preparation.");
  }
  return triangles;
}

function parseAscii(data: ArrayBuffer): Triangle[] {
  const text = new TextDecoder().decode(data);
  const triangles: Triangle[] = [];
  const verts: Vec3[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const parts = raw.trim().split(/\s+/);
    if (parts.length >= 4 && parts[0] === "vertex") {
      verts.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
      if (verts.length === 3) {
        const tri = triangleFromVerts(verts[0], verts[1], verts[2]);
        if (tri) triangles.push(tri);
        verts.length = 0;
      }
    }
  }
  if (triangles.length < 20) {
    throw new Error("The ASCII STL did not contain a usable mesh.");
  }
  return triangles;
}

export function parseStl(data: ArrayBuffer): Triangle[] {
  return isAsciiStl(data) ? parseAscii(data) : parseBinary(data);
}
