#!/usr/bin/env python3
"""Crown preparation check.

A teaching tool for dentists and dental students. It reads a preparation STL,
optional calibrated photo measurements, and the taper you measured chairside,
then compares them with the ranges used for complete-crown preparations.

This file is the runnable form of the pseudocode below. The website uses the
same steps in the browser so a clinic can open the check without installing
Python.

-----------------------------------------------------------------------
PSEUDOCODE
-----------------------------------------------------------------------

INPUT
    prep_stl            triangle mesh of the prepared tooth, millimetres
    preop_stl           optional unprepared tooth in the SAME coordinate frame
    photos              optional intraoral images
    calibration         optional, per photo: two points and a known distance
                        (periodontal probe mark or a bur of known diameter)
    taper_deg           optional total occlusal convergence measured by hand
    occlusal_mm         optional occlusal / incisal reduction
    axial_mm            optional axial reduction
    finish_mm           optional finish-line width
    material            full_metal | pfm | monolithic_zirconia |
                        layered_zirconia | lithium_disilicate | feldspathic
    tooth_fdi           permanent tooth number

GEOMETRY OF THE PREPARATION
    samples <- downsample triangles (centroid, outward normal, area)
    candidates <- principal axes of the point cloud, the coordinate axes,
                  and a Fibonacci set of directions
    FOR each candidate direction u:
        try u and its opposite
        put the flat occlusal table at the positive end of u
        keep points whose normals are nearly perpendicular to u (axial walls)
        walk from the occlusal table toward the gingiva in thin slices
        stop at the finish line, where the radius stops following one line
        (this ignores a die base that continues past the margin)
        TOC <- 2 * atan(how fast the radius shrinks toward the occlusal)
        FOR each of 8 sectors around u:
            undercut <- any rise in radius as you move toward the occlusal
        score <- linear fit quality, a plausible wall height, and little undercut
        refine the best direction with a small local search
    wall height <- occlusal plane minus finish-line height
    height / width <- wall height / margin diameter
    IF a pre-op mesh shares this frame:
        occlusal reduction <- pre-op height minus prep height along u
        axial reduction <- pre-op radius minus prep radius in the axial band

PHOTOGRAPHS
    A phone photo has no millimetre scale until something of known size is in
    the frame.
    blur <- variance of the Laplacian (warn if the prep is soft)
    exposure <- mean luminance and fraction of clipped pixels
    IF two points and a known millimetre distance are supplied:
        millimetres <- pixel distance / (calibration pixels per millimetre)

CLINICAL COMPARISON
    total occlusal convergence
        optimal 6–12°, acceptable through 20°, review 4–6° and 20–25°,
        does not meet outside that (Goodacre et al., J Prosthet Dent 2001;
        Shillingburg, Fundamentals of Fixed Prosthodontics)
    axial wall height
        molars: at least 4 mm, review under 4 down to 3
        premolars and anteriors: at least 3 mm
    occlusocervical / faciolingual ratio
        at least 0.4
    occlusal reduction, axial reduction, finish-line width
        material-specific teaching ranges (see MATERIAL_RANGES)
    undercut
        a sector that gets wider toward the occlusal cannot be seated
        on a cement-retained path without a change of axis, a block-out,
        or a modification of the wall

OUTPUT
    one status per parameter: pass, caution, fail, or missing
    overall: meets, review, rework, or incomplete
-----------------------------------------------------------------------
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Sequence

Vec = tuple[float, float, float]

# Thresholds shared with src/lib/geometry.ts. Change them in both places.
AXIAL_NORMAL_MAX = 0.58
CAP_NORMAL_MIN = 0.75
PROFILE_STEP_MM = 0.30
OCCLUSAL_SKIP_MM = 0.35
MARGIN_RESIDUAL_MM = 0.22
MIN_PROFILE_BINS = 4
MIN_BIN_POINTS = 4
WINDOW_BELOW_OCCLUSAL_MM = 8.0
UNDERCUT_FAIL_MM = 0.12
UNDERCUT_CAUTION_MM = 0.08
MAX_SAMPLES = 4500

DISCLAIMER = (
    "Teaching aid only. Not a medical device. Confirm reduction with a "
    "periodontal probe or a calibrated scanner, and follow your program's "
    "rubric, before you temporize or cement."
)


# --- small vector helpers ---------------------------------------------------

def sub(a: Vec, b: Vec) -> Vec:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def add(a: Vec, b: Vec) -> Vec:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def mul(a: Vec, s: float) -> Vec:
    return (a[0] * s, a[1] * s, a[2] * s)


def dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a: Vec, b: Vec) -> Vec:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def length(a: Vec) -> float:
    return math.sqrt(dot(a, a))


def normalize(a: Vec) -> Vec:
    mag = length(a)
    if mag < 1e-12:
        return (0.0, 0.0, 1.0)
    return (a[0] / mag, a[1] / mag, a[2] / mag)


def median(values: Sequence[float]) -> float:
    ordered = sorted(values)
    n = len(ordered)
    if n == 0:
        return 0.0
    mid = n // 2
    if n % 2:
        return ordered[mid]
    return 0.5 * (ordered[mid - 1] + ordered[mid])


def percentile(values: Sequence[float], pct: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * (pct / 100.0)
    lo = int(math.floor(rank))
    hi = int(math.ceil(rank))
    if lo == hi:
        return ordered[lo]
    return ordered[lo] * (hi - rank) + ordered[hi] * (rank - lo)


def linreg(xs: Sequence[float], ys: Sequence[float]) -> tuple[float, float, float]:
    n = len(xs)
    if n < 2:
        return 0.0, (ys[0] if ys else 0.0), 0.0
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    sxx = sum((x - mean_x) ** 2 for x in xs)
    if sxx < 1e-9:
        return 0.0, mean_y, 0.0
    sxy = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    slope = sxy / sxx
    intercept = mean_y - slope * mean_x
    sst = sum((y - mean_y) ** 2 for y in ys)
    residual = sum((y - (intercept + slope * x)) ** 2 for x, y in zip(xs, ys))
    r2 = 1.0 - residual / sst if sst > 1e-9 else 1.0
    return slope, intercept, max(-1.0, min(1.0, r2))


def rotate(vector: Vec, axis: Vec, degrees: float) -> Vec:
    """Rodrigues rotation. Does not renormalize, so mesh vertices keep their length."""
    k = normalize(axis)
    theta = math.radians(degrees)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    return add(
        add(mul(vector, cos_t), mul(cross(k, vector), sin_t)),
        mul(k, dot(k, vector) * (1.0 - cos_t)),
    )


def rotate_direction(vector: Vec, axis: Vec, degrees: float) -> Vec:
    return normalize(rotate(vector, axis, degrees))


def basis(u: Vec) -> tuple[Vec, Vec]:
    helper = (1.0, 0.0, 0.0) if abs(u[0]) < 0.9 else (0.0, 1.0, 0.0)
    x_axis = normalize(cross(u, helper))
    y_axis = cross(u, x_axis)
    return x_axis, y_axis


# --- STL --------------------------------------------------------------------

@dataclass
class Triangle:
    centroid: Vec
    normal: Vec
    area: float
    verts: tuple[Vec, Vec, Vec]


def _triangle(v1: Vec, v2: Vec, v3: Vec) -> Triangle | None:
    raw = cross(sub(v2, v1), sub(v3, v1))
    area = length(raw) * 0.5
    if area < 1e-10:
        return None
    centroid = (
        (v1[0] + v2[0] + v3[0]) / 3.0,
        (v1[1] + v2[1] + v3[1]) / 3.0,
        (v1[2] + v2[2] + v3[2]) / 3.0,
    )
    return Triangle(centroid, normalize(raw), area, (v1, v2, v3))


def _is_ascii_stl(data: bytes) -> bool:
    head = data[:5].lower()
    if head != b"solid":
        return False
    if len(data) < 84:
        return True
    count = struct.unpack_from("<I", data, 80)[0]
    return len(data) != 84 + count * 50


def parse_stl(data: bytes) -> list[Triangle]:
    if _is_ascii_stl(data):
        return _parse_ascii(data)
    return _parse_binary(data)


def _parse_binary(data: bytes) -> list[Triangle]:
    if len(data) < 84:
        raise ValueError("File is too small to be an STL.")
    count = struct.unpack_from("<I", data, 80)[0]
    expected = 84 + count * 50
    if count == 0 or count > 5_000_000 or expected > len(data) + 50:
        raise ValueError("This file does not look like a binary STL.")
    triangles: list[Triangle] = []
    offset = 84
    for _ in range(count):
        nums = struct.unpack_from("<12f", data, offset)
        tri = _triangle(
            (nums[3], nums[4], nums[5]),
            (nums[6], nums[7], nums[8]),
            (nums[9], nums[10], nums[11]),
        )
        if tri is not None:
            triangles.append(tri)
        offset += 50
    if len(triangles) < 20:
        raise ValueError("The mesh has too few triangles to measure a preparation.")
    return triangles


def _parse_ascii(data: bytes) -> list[Triangle]:
    text = data.decode("utf-8", errors="ignore")
    triangles: list[Triangle] = []
    verts: list[Vec] = []
    for raw in text.splitlines():
        parts = raw.strip().split()
        if len(parts) >= 4 and parts[0] == "vertex":
            verts.append((float(parts[1]), float(parts[2]), float(parts[3])))
            if len(verts) == 3:
                tri = _triangle(verts[0], verts[1], verts[2])
                if tri is not None:
                    triangles.append(tri)
                verts = []
    if len(triangles) < 20:
        raise ValueError("The ASCII STL did not contain a usable mesh.")
    return triangles


def write_stl(path: Path, triangles: Iterable[tuple[Vec, Vec, Vec]]) -> None:
    tris = list(triangles)
    blob = bytearray(b"Finish Line binary STL".ljust(80, b"\0"))
    blob += struct.pack("<I", len(tris))
    for v1, v2, v3 in tris:
        normal = normalize(cross(sub(v2, v1), sub(v3, v1)))
        blob += struct.pack(
            "<12fH",
            normal[0], normal[1], normal[2],
            v1[0], v1[1], v1[2],
            v2[0], v2[1], v2[2],
            v3[0], v3[1], v3[2],
            0,
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blob)


def scaled_triangles(triangles: list[Triangle]) -> tuple[list[Triangle], str | None]:
    """Dental STLs are almost always millimetres. Rescale obvious outliers."""
    xs = [t.centroid[0] for t in triangles]
    ys = [t.centroid[1] for t in triangles]
    zs = [t.centroid[2] for t in triangles]
    span = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    factor = 1.0
    note = None
    if span > 150:
        factor = 0.001
        note = "Mesh extent looked like micrometres, so coordinates were divided by 1000."
    elif span < 0.2:
        factor = 1000.0
        note = "Mesh extent looked like metres, so coordinates were multiplied by 1000."
    if factor == 1.0:
        return triangles, None
    scaled: list[Triangle] = []
    for tri in triangles:
        verts = tuple(mul(v, factor) for v in tri.verts)
        rebuilt = _triangle(verts[0], verts[1], verts[2])
        if rebuilt is not None:
            scaled.append(rebuilt)
    return scaled, note


# --- synthetic preparations (demos and self-test) --------------------------

def truncated_cone(
    *,
    height: float,
    r_gingival: float,
    toc_deg: float,
    n_theta: int = 64,
    n_z: int = 28,
    bulge: dict | None = None,
    die_height: float = 0.0,
    die_extra_r: float = 0.0,
    rotation: tuple[Vec, float] | None = None,
) -> list[tuple[Vec, Vec, Vec]]:
    """Closed-top truncated cone. z = 0 is the margin, z = height is occlusal.

    `bulge` adds a local increase in radius so one wall gets wider toward the
    occlusal — a seating undercut. `die_height` extends a cylinder gingivally
    past the margin, the way a scanned die does.
    """
    alpha = math.radians(toc_deg / 2.0)

    def radius_at(z: float, theta: float) -> float:
        radius = r_gingival - z * math.tan(alpha)
        if bulge and 0.0 <= z <= height:
            half = bulge["width"]
            delta = (theta - bulge["theta"] + math.pi) % (2.0 * math.pi) - math.pi
            if abs(delta) < half:
                lobe = math.cos(delta / half * math.pi / 2.0) ** 2
                hump = math.sin(math.pi * z / height)
                radius += bulge["amp"] * lobe * hump
        return max(radius, 0.15)

    def transform(point: Vec) -> Vec:
        if rotation is None:
            return point
        axis, degrees = rotation
        return rotate(point, axis, degrees)

    rings: list[list[Vec]] = []
    for i in range(n_z + 1):
        z = height * i / n_z
        ring = []
        for j in range(n_theta):
            theta = 2.0 * math.pi * j / n_theta
            radius = radius_at(z, theta)
            ring.append(transform((radius * math.cos(theta), radius * math.sin(theta), z)))
        rings.append(ring)

    faces: list[tuple[Vec, Vec, Vec]] = []
    for i in range(n_z):
        for j in range(n_theta):
            j2 = (j + 1) % n_theta
            a = rings[i][j]
            b = rings[i][j2]
            c = rings[i + 1][j2]
            d = rings[i + 1][j]
            faces.append((a, b, c))
            faces.append((a, c, d))

    # Occlusal table. Outward normal points to +z before rotation.
    apex = transform((0.0, 0.0, height))
    top = rings[-1]
    for j in range(n_theta):
        faces.append((apex, top[j], top[(j + 1) % n_theta]))

    if die_height > 0:
        r_die = r_gingival + die_extra_r
        die_top: list[Vec] = []
        die_bot: list[Vec] = []
        for j in range(n_theta):
            theta = 2.0 * math.pi * j / n_theta
            die_top.append(transform((r_die * math.cos(theta), r_die * math.sin(theta), 0.0)))
            die_bot.append(
                transform((r_die * math.cos(theta), r_die * math.sin(theta), -die_height))
            )
        margin = rings[0]
        for j in range(n_theta):
            j2 = (j + 1) % n_theta
            # Step from the margin ring out to the die, then the die wall.
            faces.append((margin[j], die_top[j], die_top[j2]))
            faces.append((margin[j], die_top[j2], margin[j2]))
            faces.append((die_top[j], die_bot[j], die_bot[j2]))
            faces.append((die_top[j], die_bot[j2], die_top[j2]))
        center = transform((0.0, 0.0, -die_height))
        for j in range(n_theta):
            # Bottom cap faces gingivally (before rotation, -z).
            faces.append((center, die_bot[(j + 1) % n_theta], die_bot[j]))
    return faces


# --- geometry ---------------------------------------------------------------

@dataclass
class SectorReading:
    index: int
    start_deg: float
    wall_deg: float
    undercut_mm: float


@dataclass
class Geometry:
    axis: Vec
    total_occlusal_convergence_deg: float
    mean_wall_deg: float
    axial_wall_height_mm: float
    margin_diameter_mm: float
    occlusal_diameter_mm: float
    height_to_width: float
    r_squared: float
    undercut_mm: float
    sectors: list[SectorReading]
    cap_found: bool
    confidence: str
    notes: list[str] = field(default_factory=list)
    score: float = 0.0


def _downsample(triangles: list[Triangle]) -> list[Triangle]:
    if len(triangles) <= MAX_SAMPLES:
        return triangles
    stride = math.ceil(len(triangles) / MAX_SAMPLES)
    return triangles[::stride]


def _centroid(triangles: list[Triangle]) -> Vec:
    area = sum(t.area for t in triangles) or 1.0
    return (
        sum(t.centroid[0] * t.area for t in triangles) / area,
        sum(t.centroid[1] * t.area for t in triangles) / area,
        sum(t.centroid[2] * t.area for t in triangles) / area,
    )


def _principal_axes(triangles: list[Triangle], center: Vec) -> list[Vec]:
    cov = [[0.0, 0.0, 0.0] for _ in range(3)]
    weight = 0.0
    for tri in triangles:
        d = sub(tri.centroid, center)
        weight += tri.area
        for i in range(3):
            for j in range(3):
                cov[i][j] += tri.area * d[i] * d[j]
    if weight <= 0:
        return [(1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)]
    for i in range(3):
        for j in range(3):
            cov[i][j] /= weight
    matrix = [row[:] for row in cov]
    vectors = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    for _ in range(16):
        pivot = (0, 1)
        best = abs(matrix[0][1])
        for pair in ((0, 2), (1, 2)):
            if abs(matrix[pair[0]][pair[1]]) > best:
                best = abs(matrix[pair[0]][pair[1]])
                pivot = pair
        if best < 1e-12:
            break
        p, q = pivot
        app, aqq, apq = matrix[p][p], matrix[q][q], matrix[p][q]
        phi = math.atan2(2.0 * apq, aqq - app) * 0.5 if abs(aqq - app) > 1e-15 else math.pi / 4.0
        cos_t, sin_t = math.cos(phi), math.sin(phi)
        for i in range(3):
            aip, aiq = matrix[i][p], matrix[i][q]
            matrix[i][p] = cos_t * aip - sin_t * aiq
            matrix[i][q] = sin_t * aip + cos_t * aiq
        for j in range(3):
            apj, aqj = matrix[p][j], matrix[q][j]
            matrix[p][j] = cos_t * apj - sin_t * aqj
            matrix[q][j] = sin_t * apj + cos_t * aqj
        for i in range(3):
            vip, viq = vectors[i][p], vectors[i][q]
            vectors[i][p] = cos_t * vip - sin_t * viq
            vectors[i][q] = sin_t * vip + cos_t * viq
    return [normalize((vectors[0][k], vectors[1][k], vectors[2][k])) for k in range(3)]


def _fibonacci(n: int) -> list[Vec]:
    points: list[Vec] = []
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(n):
        y = 1.0 - (i / max(n - 1, 1))
        radius = math.sqrt(max(0.0, 1.0 - y * y))
        theta = golden * i
        points.append((math.cos(theta) * radius, y, math.sin(theta) * radius))
    return points


def _height(point: Vec, center: Vec, axis: Vec) -> float:
    return dot(sub(point, center), axis)


def _radius(point: Vec, center: Vec, axis: Vec) -> float:
    offset = sub(point, center)
    h = dot(offset, axis)
    radial = sub(offset, mul(axis, h))
    return length(radial)


def _undercut_depth(bins: list[tuple[float, float]]) -> float:
    """Rise in radius while moving toward the occlusal. Zero on a true taper."""
    if len(bins) < 2:
        return 0.0
    ordered = sorted(bins, key=lambda item: item[0])
    running_min = ordered[0][1]
    worst = 0.0
    for _, radius in ordered[1:]:
        if radius > running_min:
            worst = max(worst, radius - running_min)
        else:
            running_min = radius
    return worst


def _evaluate_oriented(
    samples: list[Triangle], center: Vec, axis: Vec
) -> Geometry | None:
    axis = normalize(axis)
    caps = [t for t in samples if dot(t.normal, axis) > CAP_NORMAL_MIN]
    heights = [_height(t.centroid, center, axis) for t in samples]
    # The occlusal table is the upward-facing cluster at the far end. A die
    # step or a shoulder can also face the same way, lower down the tooth.
    cap_found = False
    h_occ = percentile(heights, 97)
    if len(caps) >= 8:
        cap_heights = [_height(t.centroid, center, axis) for t in caps]
        highest = max(cap_heights)
        top = [h for h in cap_heights if h >= highest - 1.0]
        if len(top) >= 6:
            h_occ = median(top)
            cap_found = True

    axial: list[tuple[float, float, float]] = []
    for tri in samples:
        if abs(dot(tri.normal, axis)) > AXIAL_NORMAL_MAX:
            continue
        h = _height(tri.centroid, center, axis)
        if h > h_occ - OCCLUSAL_SKIP_MM or h < h_occ - WINDOW_BELOW_OCCLUSAL_MM:
            continue
        axial.append((h, _radius(tri.centroid, center, axis), math.atan2(1.0, 1.0)))

    if len(axial) < 40:
        return None

    # Replace the placeholder angle once the basis is known.
    x_axis, y_axis = basis(axis)
    angled: list[tuple[float, float, float]] = []
    for tri in samples:
        if abs(dot(tri.normal, axis)) > AXIAL_NORMAL_MAX:
            continue
        h = _height(tri.centroid, center, axis)
        if h > h_occ - OCCLUSAL_SKIP_MM or h < h_occ - WINDOW_BELOW_OCCLUSAL_MM:
            continue
        offset = sub(tri.centroid, center)
        radial_vec = sub(offset, mul(axis, h))
        theta = math.atan2(dot(radial_vec, y_axis), dot(radial_vec, x_axis))
        angled.append((h, length(radial_vec), theta))
    axial = angled

    bins: dict[int, list[float]] = {}
    for h, radius, _theta in axial:
        key = int(round((h_occ - h) / PROFILE_STEP_MM))
        bins.setdefault(key, []).append(radius)
    profile = []
    for key in sorted(bins):
        if len(bins[key]) < MIN_BIN_POINTS:
            continue
        profile.append((h_occ - key * PROFILE_STEP_MM, median(bins[key])))
    # Occlusal end is the small keys, so the list is occlusal -> gingival.
    profile.sort(key=lambda item: item[0], reverse=True)
    if len(profile) < MIN_PROFILE_BINS:
        return None

    end = len(profile)
    start = MIN_PROFILE_BINS
    while start < end:
        window = profile[: start + 1]
        xs = [h for h, _r in window]
        ys = [r for _h, r in window]
        slope, intercept, r2 = linreg(xs, ys)
        h_next, r_next = profile[start]
        if abs(r_next - (intercept + slope * h_next)) > MARGIN_RESIDUAL_MM or r2 < 0.75:
            break
        start += 1
    window = profile[:start]
    if len(window) < MIN_PROFILE_BINS:
        return None
    xs = [h for h, _r in window]
    ys = [r for _h, r in window]
    slope, intercept, r2 = linreg(xs, ys)
    h_margin = min(xs)
    h_top = max(xs)
    if h_top - h_margin < 1.2:
        return None
    wall_height = h_occ - h_margin
    half_angle = math.atan(-slope)
    toc = math.degrees(half_angle) * 2.0
    r_margin = intercept + slope * h_margin
    r_occlusal = intercept + slope * h_occ
    if r_margin < 0.4 or wall_height > 12.0 or wall_height < 1.2:
        return None

    sectors: list[SectorReading] = []
    worst_undercut = 0.0
    wall_angles: list[float] = []
    for index in range(8):
        lo = -math.pi + index * (math.pi / 4.0)
        hi = lo + math.pi / 4.0
        points = [
            (h, radius)
            for h, radius, theta in axial
            if h_margin - 0.05 <= h <= h_occ - OCCLUSAL_SKIP_MM and lo <= theta < hi
        ]
        if len(points) < 8:
            sectors.append(SectorReading(index, math.degrees(lo) % 360.0, toc / 2.0, 0.0))
            continue
        sector_bins: dict[int, list[float]] = {}
        for h, radius in points:
            key = int(round(h / PROFILE_STEP_MM))
            sector_bins.setdefault(key, []).append(radius)
        ordered = [
            (key * PROFILE_STEP_MM, median(values))
            for key, values in sorted(sector_bins.items())
            if len(values) >= 2
        ]
        if len(ordered) < 3:
            sectors.append(SectorReading(index, math.degrees(lo) % 360.0, toc / 2.0, 0.0))
            continue
        s_slope, _, _ = linreg([h for h, _r in ordered], [r for _h, r in ordered])
        wall = math.degrees(math.atan(-s_slope))
        depth = _undercut_depth(ordered)
        worst_undercut = max(worst_undercut, depth)
        wall_angles.append(wall)
        sectors.append(SectorReading(index, math.degrees(lo) % 360.0, wall, depth))

    mean_wall = sum(wall_angles) / len(wall_angles) if wall_angles else toc / 2.0
    margin_diameter = max(r_margin, 0.2) * 2.0
    ratio = wall_height / margin_diameter if margin_diameter else 0.0
    if r2 >= 0.9 and cap_found and len(window) >= 6:
        confidence = "high"
    elif r2 >= 0.7:
        confidence = "moderate"
    else:
        confidence = "low"

    score = r2 * 5.0
    score += 1.1 if cap_found else 0.0
    if 2.0 <= wall_height <= 8.0:
        score += 0.9
    if 2.0 <= toc <= 45.0:
        score += 0.6
    score -= min(worst_undercut, 3.0) * 0.15
    if toc < -8.0 or toc > 80.0:
        score -= 3.0
    # Prefer the orientation that actually tapers toward the cap.
    if slope < 0:
        score += 0.4

    return Geometry(
        axis=axis,
        total_occlusal_convergence_deg=toc,
        mean_wall_deg=mean_wall,
        axial_wall_height_mm=wall_height,
        margin_diameter_mm=margin_diameter,
        occlusal_diameter_mm=max(r_occlusal, 0.0) * 2.0,
        height_to_width=ratio,
        r_squared=r2,
        undercut_mm=worst_undercut,
        sectors=sectors,
        cap_found=cap_found,
        confidence=confidence,
        score=score,
    )


def _better(current: Geometry | None, challenger: Geometry | None) -> Geometry | None:
    if challenger is None:
        return current
    if current is None or challenger.score > current.score:
        return challenger
    return current


def _evaluate_both(samples: list[Triangle], center: Vec, axis: Vec) -> Geometry | None:
    forward = _evaluate_oriented(samples, center, axis)
    backward = _evaluate_oriented(samples, center, mul(axis, -1.0))
    return _better(forward, backward)


def analyze_triangles(triangles: list[Triangle]) -> Geometry:
    triangles, unit_note = scaled_triangles(triangles)
    samples = _downsample(triangles)
    center = _centroid(samples)
    candidates = [(1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)]
    candidates.extend(_principal_axes(samples, center))
    candidates.extend(_fibonacci(24))

    best: Geometry | None = None
    for axis in candidates:
        best = _better(best, _evaluate_both(samples, center, axis))
    if best is None:
        raise ValueError(
            "The mesh does not look like a single crown preparation. "
            "Export the prepared tooth, not a full arch."
        )

    axis = best.axis
    step = 12.0
    for _ in range(28):
        if step < 1.5:
            break
        x_axis, y_axis = basis(axis)
        improved = False
        for pivot in (x_axis, y_axis):
            for degrees in (step, -step):
                trial = _evaluate_both(samples, center, rotate_direction(axis, pivot, degrees))
                if trial is not None and (best is None or trial.score > best.score + 1e-4):
                    best = trial
                    axis = trial.axis
                    improved = True
        if not improved:
            step *= 0.5

    assert best is not None
    if unit_note:
        best.notes.append(unit_note)
    if best.confidence == "low":
        best.notes.append(
            "The axial walls did not read as a clean cone. Treat the angle as a guide and confirm it on the die."
        )
    if not best.cap_found:
        best.notes.append(
            "No flat occlusal table was found. Height is measured from the highest surface."
        )
    flagged = [s for s in best.sectors if s.undercut_mm >= UNDERCUT_FAIL_MM]
    if flagged:
        best.notes.append(
            f"{len(flagged)} of 8 wall sectors get wider toward the occlusal, which blocks a single path of insertion."
        )
    return best


def analyze_stl_bytes(data: bytes) -> Geometry:
    return analyze_triangles(parse_stl(data))


def reduction_from_preop(prep: list[Triangle], preop: list[Triangle], axis: Vec) -> dict:
    """Only valid when both meshes already share a scanner coordinate frame."""
    prep, _ = scaled_triangles(prep)
    preop, _ = scaled_triangles(preop)
    axis = normalize(axis)
    prep_c = _centroid(_downsample(prep))
    prep_h = [_height(t.centroid, prep_c, axis) for t in prep]
    pre_h = [_height(t.centroid, prep_c, axis) for t in preop]
    occlusal = percentile(pre_h, 98) - percentile(prep_h, 98)

    def band_radius(tris: list[Triangle], h0: float, h1: float) -> float:
        radii = [
            _radius(t.centroid, prep_c, axis)
            for t in tris
            if h0 <= _height(t.centroid, prep_c, axis) <= h1 and abs(dot(t.normal, axis)) < 0.7
        ]
        return median(radii) if radii else 0.0

    h_margin = percentile(prep_h, 20)
    h_occ = percentile(prep_h, 90)
    axial = band_radius(preop, h_margin, h_occ) - band_radius(prep, h_margin, h_occ)
    return {
        "occlusal_reduction_mm": round(occlusal, 2),
        "axial_reduction_mm": round(axial, 2),
        "note": "Pre-op comparison assumes both STLs already share one coordinate frame. It is not an automatic best-fit alignment.",
    }


# --- clinical rules ---------------------------------------------------------

MATERIAL_RANGES: dict[str, dict[str, dict[str, float]]] = {
    # ideal_min, ideal_max, accept_min, accept_max, all millimetres
    "full_metal": {
        "occlusal": {"ideal_min": 1.0, "ideal_max": 1.5, "accept_min": 0.8, "accept_max": 1.8},
        "axial": {"ideal_min": 0.5, "ideal_max": 1.0, "accept_min": 0.4, "accept_max": 1.3},
        "finish": {"ideal_min": 0.3, "ideal_max": 0.5, "accept_min": 0.3, "accept_max": 0.7},
    },
    "pfm": {
        "occlusal": {"ideal_min": 1.5, "ideal_max": 2.0, "accept_min": 1.3, "accept_max": 2.4},
        "axial": {"ideal_min": 1.2, "ideal_max": 1.5, "accept_min": 1.0, "accept_max": 1.8},
        "finish": {"ideal_min": 1.0, "ideal_max": 1.3, "accept_min": 0.8, "accept_max": 1.5},
    },
    "monolithic_zirconia": {
        "occlusal": {"ideal_min": 1.0, "ideal_max": 1.5, "accept_min": 0.8, "accept_max": 2.0},
        "axial": {"ideal_min": 0.8, "ideal_max": 1.2, "accept_min": 0.6, "accept_max": 1.5},
        "finish": {"ideal_min": 0.5, "ideal_max": 1.0, "accept_min": 0.4, "accept_max": 1.2},
    },
    "layered_zirconia": {
        "occlusal": {"ideal_min": 1.5, "ideal_max": 2.0, "accept_min": 1.3, "accept_max": 2.4},
        "axial": {"ideal_min": 1.2, "ideal_max": 1.5, "accept_min": 1.0, "accept_max": 1.8},
        "finish": {"ideal_min": 1.0, "ideal_max": 1.2, "accept_min": 0.8, "accept_max": 1.5},
    },
    "lithium_disilicate": {
        "occlusal": {"ideal_min": 1.5, "ideal_max": 2.0, "accept_min": 1.3, "accept_max": 2.3},
        "axial": {"ideal_min": 1.0, "ideal_max": 1.5, "accept_min": 0.8, "accept_max": 1.8},
        "finish": {"ideal_min": 1.0, "ideal_max": 1.2, "accept_min": 0.8, "accept_max": 1.4},
    },
    "feldspathic": {
        "occlusal": {"ideal_min": 1.5, "ideal_max": 2.0, "accept_min": 1.5, "accept_max": 2.4},
        "axial": {"ideal_min": 1.0, "ideal_max": 1.5, "accept_min": 1.0, "accept_max": 1.8},
        "finish": {"ideal_min": 1.0, "ideal_max": 1.2, "accept_min": 0.9, "accept_max": 1.5},
    },
}

MATERIAL_LABELS = {
    "full_metal": "Full metal",
    "pfm": "Porcelain fused to metal",
    "monolithic_zirconia": "Monolithic zirconia",
    "layered_zirconia": "Layered zirconia",
    "lithium_disilicate": "Lithium disilicate",
    "feldspathic": "Feldspathic porcelain",
}

FINISH_LINE = {
    "full_metal": "light chamfer",
    "pfm": "shoulder or heavy chamfer on the facial",
    "monolithic_zirconia": "chamfer",
    "layered_zirconia": "heavy chamfer or shoulder",
    "lithium_disilicate": "shoulder or heavy chamfer",
    "feldspathic": "rounded shoulder",
}


def tooth_group(fdi: int) -> str:
    if fdi < 11 or fdi > 48 or fdi % 10 == 0 or fdi % 10 > 8:
        raise ValueError(f"FDI {fdi} is not a permanent tooth.")
    quadrant = fdi // 10
    if quadrant not in (1, 2, 3, 4):
        raise ValueError(f"FDI {fdi} is not a permanent tooth.")
    digit = fdi % 10
    if digit <= 3:
        return "anterior"
    if digit <= 5:
        return "premolar"
    return "molar"


def _band_status(value: float, band: dict[str, float]) -> str:
    if band["ideal_min"] <= value <= band["ideal_max"]:
        return "pass"
    if band["accept_min"] <= value <= band["accept_max"]:
        return "caution"
    return "fail"


def _toc_status(toc: float) -> str:
    if 6.0 <= toc <= 12.0:
        return "pass"
    if 12.0 < toc <= 20.0 or 4.0 <= toc < 6.0:
        return "caution"
    if 20.0 < toc <= 25.0:
        return "caution"
    return "fail"


def _height_status(height: float, group: str, source: str) -> str:
    # A mesh estimate can sit about 0.2 mm short of a sharp margin or line angle.
    slack = 0.2 if source == "scan" else 0.0
    if group == "molar":
        if height + slack >= 4.0:
            return "pass"
        if height >= 3.0:
            return "caution"
        return "fail"
    if height + slack >= 3.0:
        return "pass"
    if height >= 2.5:
        return "caution"
    return "fail"


def _ratio_status(ratio: float) -> str:
    if ratio >= 0.4:
        return "pass"
    if ratio >= 0.3:
        return "caution"
    return "fail"


def _fmt(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}"


def build_report(
    *,
    geometry: Geometry | None,
    tooth: int | None,
    material: str,
    taper_deg: float | None,
    occlusal_mm: float | None,
    axial_mm: float | None,
    finish_mm: float | None,
    height_mm: float | None,
    photo_notes: list[str] | None = None,
) -> dict:
    if material not in MATERIAL_RANGES:
        raise ValueError(f"Unknown material '{material}'.")
    group = tooth_group(tooth) if tooth else None
    ranges = MATERIAL_RANGES[material]
    parameters: list[dict] = []

    toc_value = taper_deg if taper_deg is not None else (
        geometry.total_occlusal_convergence_deg if geometry else None
    )
    toc_source = "entered" if taper_deg is not None else "scan"
    if toc_value is None:
        parameters.append(_missing(
            "toc",
            "Total occlusal convergence",
            "deg",
            "6–12° optimal, up to 20° acceptable",
            "Load a preparation STL or type the angle you measured.",
        ))
    else:
        status = _toc_status(toc_value)
        if geometry and geometry.confidence == "low" and taper_deg is None and status == "pass":
            status = "caution"
        scan_bit = ""
        if geometry and taper_deg is not None:
            scan_bit = f" The scan estimate was {_fmt(geometry.total_occlusal_convergence_deg)}°."
        if status == "pass":
            note = "Within the textbook taper. Retention is favoured if the walls are long enough."
        elif toc_value < 6:
            note = "Very parallel. Look for undercuts and check that the crown seats without binding."
        elif toc_value <= 20:
            note = "Inside the 10–20° clinical range described by Goodacre, Campagni, and Aquilino (J Prosthet Dent 2001)."
        elif toc_value <= 25:
            note = "Retention is thinning. Grooves, boxes, or an adhesive plan are worth considering."
        else:
            note = "Too tapered for reliable cement retention on this path. Reduce the convergence or add resistance features."
        parameters.append({
            "id": "toc",
            "label": "Total occlusal convergence",
            "value": round(toc_value, 2),
            "unit": "deg",
            "target": "6–12° optimal, up to 20° acceptable",
            "status": status,
            "source": toc_source,
            "note": note + scan_bit,
        })

    height_value = height_mm if height_mm is not None else (
        geometry.axial_wall_height_mm if geometry else None
    )
    if height_value is None or group is None:
        target = "≥ 4 mm molars, ≥ 3 mm other teeth"
        parameters.append(_missing(
            "wall_height",
            "Axial wall height",
            "mm",
            target,
            "Choose a tooth and load a scan, or type the height.",
        ))
    else:
        source = "entered" if height_mm is not None else "scan"
        status = _height_status(height_value, group, source)
        target = "≥ 4 mm" if group == "molar" else "≥ 3 mm"
        floor = 4.0 if group == "molar" else 3.0
        if status == "pass" and height_value < floor:
            note = (
                f"Measured {_fmt(height_value)} mm, inside the scan tolerance of the {target} guide for a {group}."
            )
        elif status == "pass":
            note = f"Meets the {target} occlusocervical guide for a {group}."
        elif status == "caution":
            note = "Shorter than the usual target. Resistance form depends on grooves, a ferrule plan, or adhesive cement."
        else:
            note = "Too short for dependable resistance form on a cement-retained crown."
        parameters.append({
            "id": "wall_height",
            "label": "Axial wall height",
            "value": round(height_value, 2),
            "unit": "mm",
            "target": target,
            "status": status,
            "source": "entered" if height_mm is not None else "scan",
            "note": note,
        })

    if geometry is None:
        parameters.append(_missing(
            "ratio",
            "Height-to-width ratio",
            "ratio",
            "≥ 0.4",
            "Comes from the preparation mesh (occlusocervical height ÷ margin diameter).",
        ))
        parameters.append(_missing(
            "undercut",
            "Path of insertion",
            "mm",
            "No wall wider toward the occlusal",
            "Comes from the preparation mesh.",
        ))
    else:
        ratio_status = _ratio_status(geometry.height_to_width)
        parameters.append({
            "id": "ratio",
            "label": "Height-to-width ratio",
            "value": round(geometry.height_to_width, 2),
            "unit": "ratio",
            "target": "≥ 0.4",
            "status": ratio_status,
            "source": "scan",
            "note": (
                "Occlusocervical dimension divided by the margin diameter. "
                "Goodacre and colleagues used 0.4 as the resistance-form floor."
                if ratio_status == "pass"
                else "Below 0.4 the preparation resists displacement poorly, even when the taper looks modest."
            ),
        })
        under_status = (
            "fail" if geometry.undercut_mm >= UNDERCUT_FAIL_MM
            else "caution" if geometry.undercut_mm >= UNDERCUT_CAUTION_MM
            else "pass"
        )
        parameters.append({
            "id": "undercut",
            "label": "Path of insertion",
            "value": round(geometry.undercut_mm, 2),
            "unit": "mm",
            "target": "No wall wider toward the occlusal",
            "status": under_status,
            "source": "scan",
            "note": (
                "No sector gets wider as it runs toward the occlusal table."
                if under_status == "pass"
                else "At least one sector bulges toward the occlusal. The crown will bind or rock unless that wall is relieved or the path changes."
            ),
        })

    _append_mm(
        parameters,
        "occlusal",
        "Occlusal reduction",
        occlusal_mm,
        ranges["occlusal"],
        FINISH_LINE[material],
        low="Thin occlusal reduction leaves too little room for the material.",
        high="Heavy occlusal reduction. Re-check the remaining dentine and the pulp.",
        ok="Enough room for the chosen material on the teaching range.",
    )
    _append_mm(
        parameters,
        "axial",
        "Axial reduction",
        axial_mm,
        ranges["axial"],
        FINISH_LINE[material],
        low="Axial reduction is light for this material. The contour will be bulky or the ceramic thin.",
        high="Axial reduction is heavy. Retention gets shorter as the stump narrows.",
        ok="Axial room matches the teaching range for this material.",
    )
    _append_mm(
        parameters,
        "finish",
        "Finish-line width",
        finish_mm,
        ranges["finish"],
        FINISH_LINE[material],
        low="The finish line is narrow for this material.",
        high="The finish line is wider than this material needs.",
        ok=f"Width suits a {FINISH_LINE[material]}.",
    )

    if any(item["status"] == "fail" for item in parameters):
        overall = "rework"
        summary = "One or more parameters are outside the range. Rework the preparation before the impression."
    elif any(item["status"] == "missing" for item in parameters):
        if any(item["status"] == "caution" for item in parameters):
            overall = "review"
            summary = "Some findings need a second look, and the check is still missing measurements."
        else:
            overall = "incomplete"
            summary = "Nothing has failed. Reduction or finish-line width is still missing, so this is not a complete check."
    elif any(item["status"] == "caution" for item in parameters):
        overall = "review"
        summary = "Nothing has failed outright. Review the caution items before you take the impression."
    else:
        overall = "meets"
        summary = "Taper, wall height, reduction, and finish line are inside the teaching ranges."

    geometry_block = None
    if geometry is not None:
        geometry_block = {
            "total_occlusal_convergence_deg": round(geometry.total_occlusal_convergence_deg, 2),
            "mean_wall_deg": round(geometry.mean_wall_deg, 2),
            "axial_wall_height_mm": round(geometry.axial_wall_height_mm, 2),
            "margin_diameter_mm": round(geometry.margin_diameter_mm, 2),
            "occlusal_diameter_mm": round(geometry.occlusal_diameter_mm, 2),
            "height_to_width": round(geometry.height_to_width, 2),
            "undercut_mm": round(geometry.undercut_mm, 2),
            "r_squared": round(geometry.r_squared, 3),
            "confidence": geometry.confidence,
            "axis": [round(v, 4) for v in geometry.axis],
            "sectors": [
                {
                    "index": s.index,
                    "start_deg": round(s.start_deg, 1),
                    "wall_deg": round(s.wall_deg, 2),
                    "undercut_mm": round(s.undercut_mm, 3),
                }
                for s in geometry.sectors
            ],
            "notes": geometry.notes,
        }

    return {
        "tooth_fdi": tooth,
        "tooth_group": group,
        "material": material,
        "material_label": MATERIAL_LABELS[material],
        "finish_line": FINISH_LINE[material],
        "overall": overall,
        "summary": summary,
        "parameters": parameters,
        "geometry": geometry_block,
        "photo_notes": photo_notes or [],
        "disclaimer": DISCLAIMER,
    }


def _missing(pid: str, label: str, unit: str, target: str, note: str) -> dict:
    return {
        "id": pid,
        "label": label,
        "value": None,
        "unit": unit,
        "target": target,
        "status": "missing",
        "source": None,
        "note": note,
    }


def _append_mm(
    parameters: list[dict],
    pid: str,
    label: str,
    value: float | None,
    band: dict[str, float],
    finish_name: str,
    *,
    low: str,
    high: str,
    ok: str,
) -> None:
    target = (
        f"{_fmt(band['ideal_min'])}–{_fmt(band['ideal_max'])} mm "
        f"(acceptable {_fmt(band['accept_min'])}–{_fmt(band['accept_max'])})"
    )
    if value is None:
        note = "Type a probe reading, or calibrate a photo with a probe mark or a bur of known diameter."
        if pid == "finish":
            note = f"For this material the teaching finish line is a {finish_name}. " + note
        parameters.append(_missing(pid, label, "mm", target, note))
        return
    status = _band_status(value, band)
    if status == "pass":
        note = ok
    elif value < band["ideal_min"]:
        note = low
    else:
        note = high
    parameters.append({
        "id": pid,
        "label": label,
        "value": round(value, 2),
        "unit": "mm",
        "target": target,
        "status": status,
        "source": "entered",
        "note": note,
    })


def image_quality(path: Path) -> dict:
    try:
        from PIL import Image  # type: ignore
    except ImportError:
        return {
            "available": False,
            "note": "Pillow is not installed. Photo sharpness was not scored. pip install pillow",
        }
    image = Image.open(path).convert("L")
    image.thumbnail((240, 240))
    pixels = list(image.getdata())
    width, height = image.size
    if width < 8 or height < 8:
        return {"available": True, "label": "Too small", "ok": False}
    mean = sum(pixels) / len(pixels)
    clipped = sum(1 for p in pixels if p < 8 or p > 247) / len(pixels)
    # Variance of a 4-neighbour Laplacian on the thumbnail.
    acc = 0.0
    count = 0
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            center = pixels[y * width + x]
            lap = (
                pixels[(y - 1) * width + x]
                + pixels[(y + 1) * width + x]
                + pixels[y * width + x - 1]
                + pixels[y * width + x + 1]
                - 4 * center
            )
            acc += lap * lap
            count += 1
    score = acc / max(count, 1)
    if mean < 45:
        label, ok = "Too dark", False
    elif clipped > 0.18:
        label, ok = "Blown highlights", False
    elif score < 40:
        label, ok = "Soft — retake if you can", False
    else:
        label, ok = "Sharp enough", True
    return {
        "available": True,
        "blur_score": round(score, 1),
        "mean_luma": round(mean, 1),
        "clipped_fraction": round(clipped, 3),
        "label": label,
        "ok": ok,
    }


# --- self test and CLI ------------------------------------------------------

def _expect(name: str, value: float, target: float, tol: float) -> None:
    if abs(value - target) > tol:
        raise SystemExit(
            f"FAIL {name}: got {value:.3f}, expected {target:.3f} ± {tol}"
        )
    print(f"  ok {name}: {value:.2f} (target {target:.2f} ± {tol})")


def _run_case(name: str, faces: list[tuple[Vec, Vec, Vec]]) -> Geometry:
    tris = []
    for v1, v2, v3 in faces:
        tri = _triangle(v1, v2, v3)
        if tri is not None:
            tris.append(tri)
    geometry = analyze_triangles(tris)
    print(
        f"{name}: TOC {geometry.total_occlusal_convergence_deg:.2f}°  "
        f"height {geometry.axial_wall_height_mm:.2f} mm  "
        f"undercut {geometry.undercut_mm:.2f} mm  "
        f"R² {geometry.r_squared:.3f}  "
        f"confidence {geometry.confidence}  "
        f"axis ({geometry.axis[0]:.2f}, {geometry.axis[1]:.2f}, {geometry.axis[2]:.2f})"
    )
    return geometry


def self_test() -> None:
    ideal = dict(height=4.2, r_gingival=3.8, toc_deg=12.0)
    geometry = _run_case("ideal", truncated_cone(**ideal))
    _expect("ideal TOC", geometry.total_occlusal_convergence_deg, 12.0, 1.2)
    _expect("ideal height", geometry.axial_wall_height_mm, 4.2, 0.45)
    if geometry.undercut_mm > 0.08:
        raise SystemExit(f"FAIL ideal undercut: {geometry.undercut_mm:.3f}")
    print("  ok ideal has no undercut")

    rotated = _run_case(
        "rotated",
        truncated_cone(**ideal, rotation=((0.2, 1.0, 0.1), 47.0)),
    )
    _expect("rotated TOC", rotated.total_occlusal_convergence_deg, 12.0, 1.5)
    _expect("rotated height", rotated.axial_wall_height_mm, 4.2, 0.5)

    on_die = _run_case(
        "on die",
        truncated_cone(**ideal, die_height=6.0, die_extra_r=0.75),
    )
    _expect("die TOC", on_die.total_occlusal_convergence_deg, 12.0, 2.0)
    _expect("die height", on_die.axial_wall_height_mm, 4.2, 0.7)
    if on_die.undercut_mm > 0.1:
        raise SystemExit(f"FAIL die undercut: {on_die.undercut_mm:.3f}")
    print("  ok die base was ignored")

    steep = _run_case("overtapered", truncated_cone(height=4.0, r_gingival=4.2, toc_deg=28.0))
    _expect("overtaper TOC", steep.total_occlusal_convergence_deg, 28.0, 1.8)

    bulged = _run_case(
        "undercut",
        truncated_cone(
            **ideal,
            bulge={"amp": 0.62, "width": 0.95, "theta": 0.4},
        ),
    )
    if bulged.undercut_mm < 0.15:
        raise SystemExit(f"FAIL undercut not detected: {bulged.undercut_mm:.3f}")
    print(f"  ok undercut detected ({bulged.undercut_mm:.2f} mm)")

    report = build_report(
        geometry=steep,
        tooth=36,
        material="lithium_disilicate",
        taper_deg=None,
        occlusal_mm=1.1,
        axial_mm=1.2,
        finish_mm=1.0,
        height_mm=None,
    )
    by_id = {item["id"]: item["status"] for item in report["parameters"]}
    if by_id["toc"] != "fail":
        raise SystemExit(f"FAIL clinical TOC status {by_id['toc']}")
    if by_id["occlusal"] != "fail":
        raise SystemExit(f"FAIL clinical occlusal status {by_id['occlusal']}")
    if report["overall"] != "rework":
        raise SystemExit(f"FAIL overall {report['overall']}")
    print("  ok clinical report flags overtaper and light occlusal reduction")

    # Round-trip the STL writer.
    path = Path("/tmp/finish-line-ideal.stl")
    write_stl(path, truncated_cone(**ideal))
    reread = analyze_stl_bytes(path.read_bytes())
    _expect("reread TOC", reread.total_occlusal_convergence_deg, 12.0, 1.2)
    print("self-test passed")


def write_demos(folder: Path) -> None:
    specs = {
        "ideal-12.stl": dict(height=4.2, r_gingival=3.8, toc_deg=12.0),
        "overtapered-28.stl": dict(height=4.0, r_gingival=4.2, toc_deg=28.0),
        "undercut-buccal.stl": dict(
            height=4.2,
            r_gingival=3.8,
            toc_deg=12.0,
            bulge={"amp": 0.62, "width": 0.95, "theta": 0.4},
        ),
        "ideal-on-die.stl": dict(
            height=4.2, r_gingival=3.8, toc_deg=12.0, die_height=6.0, die_extra_r=0.75
        ),
        "rotated-12.stl": dict(
            height=4.2,
            r_gingival=3.8,
            toc_deg=12.0,
            rotation=((0.2, 1.0, 0.1), 47.0),
        ),
    }
    for name, spec in specs.items():
        destination = folder / name
        write_stl(destination, truncated_cone(**spec))
        print(f"wrote {destination}")


def _float_arg(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check a crown preparation STL against clinical teaching ranges."
    )
    parser.add_argument("--stl", type=Path, help="Preparation STL (binary or ASCII), in millimetres.")
    parser.add_argument("--preop", type=Path, help="Optional pre-op STL in the same coordinate frame.")
    parser.add_argument("--image", type=Path, action="append", default=[], help="Intraoral photo. Repeatable.")
    parser.add_argument("--tooth", type=int, help="FDI tooth number, for example 36.")
    parser.add_argument("--material", default="lithium_disilicate", choices=sorted(MATERIAL_RANGES))
    parser.add_argument("--taper", type=float, help="Total occlusal convergence in degrees, if you measured it.")
    parser.add_argument("--occlusal-mm", type=float, help="Occlusal or incisal reduction in millimetres.")
    parser.add_argument("--axial-mm", type=float, help="Axial reduction in millimetres.")
    parser.add_argument("--finish-mm", type=float, help="Finish-line width in millimetres.")
    parser.add_argument("--height-mm", type=float, help="Axial wall height, if you prefer your own measurement.")
    parser.add_argument("--self-test", action="store_true", help="Check the geometry engine on known cones.")
    parser.add_argument("--write-demos", type=Path, help="Write teaching STL files into this directory.")
    parser.add_argument("--pseudocode", action="store_true", help="Print the algorithm and exit.")
    args = parser.parse_args(argv)

    if args.pseudocode:
        print(__doc__)
        return 0
    if args.self_test:
        self_test()
        return 0
    if args.write_demos:
        write_demos(args.write_demos)
        return 0
    if args.stl is None:
        parser.print_help()
        return 2

    geometry = analyze_stl_bytes(args.stl.read_bytes())
    photo_notes = []
    for image_path in args.image:
        quality = image_quality(image_path)
        photo_notes.append(f"{image_path.name}: {quality.get('label') or quality.get('note')}")
    preop_block = None
    if args.preop:
        preop_block = reduction_from_preop(
            parse_stl(args.stl.read_bytes()),
            parse_stl(args.preop.read_bytes()),
            geometry.axis,
        )
    report = build_report(
        geometry=geometry,
        tooth=args.tooth,
        material=args.material,
        taper_deg=args.taper,
        occlusal_mm=args.occlusal_mm,
        axial_mm=args.axial_mm,
        finish_mm=args.finish_mm,
        height_mm=args.height_mm,
        photo_notes=photo_notes,
    )
    if preop_block:
        report["preop_comparison"] = preop_block
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
