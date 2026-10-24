"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PhotoShot } from "@/components/photo-desk";
import { VIEWS, type ViewId } from "@/lib/views";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number };
type Kind = "occlusal" | "axial" | "finish";

export type Calibration = {
  pxPerMm: number;
  knownMm: number;
  label: string;
  a: Point;
  b: Point;
};

const REFERENCES = [
  { id: "probe-1", label: "Probe mark, 1 mm", mm: 1 },
  { id: "probe-2", label: "Probe mark, 2 mm", mm: 2 },
  { id: "probe-3", label: "Probe mark, 3 mm", mm: 3 },
  { id: "bur-08", label: "Bur diameter 0.8 mm", mm: 0.8 },
  { id: "bur-10", label: "Bur diameter 1.0 mm", mm: 1 },
  { id: "bur-12", label: "Bur diameter 1.2 mm", mm: 1.2 },
  { id: "bur-14", label: "Bur diameter 1.4 mm", mm: 1.4 },
  { id: "bur-16", label: "Bur diameter 1.6 mm", mm: 1.6 },
];

const KINDS: { id: Kind; label: string }[] = [
  { id: "occlusal", label: "Occlusal reduction" },
  { id: "axial", label: "Axial reduction" },
  { id: "finish", label: "Finish-line width" },
];

export function MeasurePanel({
  photos,
  selectedId,
  onSelect,
  calibrations,
  onCalibrate,
  onReading,
}: {
  photos: PhotoShot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  calibrations: Record<string, Calibration | undefined>;
  onCalibrate: (photoId: string, calibration: Calibration) => void;
  onReading: (kind: Kind, mm: number) => void;
}) {
  const photo = photos.find((item) => item.id === selectedId) ?? photos[0] ?? null;
  const [mode, setMode] = useState<"calibrate" | "measure">("calibrate");
  const [referenceId, setReferenceId] = useState("probe-3");
  const [kind, setKind] = useState<Kind>("occlusal");
  const [points, setPoints] = useState<Point[]>([]);
  const [message, setMessage] = useState("Tap two points on a known distance.");
  const [size, setSize] = useState({ w: 1, h: 1 });

  useEffect(() => {
    setPoints([]);
    const calibration = photo ? calibrations[photo.id] : undefined;
    setMessage(
      calibration
        ? `${calibration.label} is set. You can measure, or tap two new points to recalibrate.`
        : "Tap two points on a known distance. A photo has no millimetre scale until you do.",
    );
  }, [photo?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- reset when the photo changes

  if (!photo) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm leading-relaxed text-muted-foreground">
        Add a chairside photo if you want to measure on the image. You can also type probe or caliper readings in the fields below. An uncalibrated photo is not used as a millimetre measurement.
      </div>
    );
  }

  const calibration = calibrations[photo.id];
  const reference = REFERENCES.find((item) => item.id === referenceId) ?? REFERENCES[2];

  function commit(next: [Point, Point]) {
    const px = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y);
    if (px < 4) {
      setMessage("Those points are almost on top of each other. Spread them across the real distance.");
      return;
    }
    if (mode === "calibrate") {
      onCalibrate(photo!.id, {
        pxPerMm: px / reference.mm,
        knownMm: reference.mm,
        label: reference.label,
        a: next[0],
        b: next[1],
      });
      setMessage(`${reference.label} locked. Switch to Measure and tap the gap you care about.`);
      setMode("measure");
      return;
    }
    if (!calibration) {
      setMessage("Calibrate this photo first. The phone does not know millimetres on its own.");
      setMode("calibrate");
      return;
    }
    const mm = px / calibration.pxPerMm;
    onReading(kind, mm);
    const label = KINDS.find((item) => item.id === kind)?.label ?? "Reading";
    setMessage(`${label} set to ${mm.toFixed(2)} mm from this photo. Edit the field below if you want to override it.`);
  }

  function tap(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * size.w,
      y: ((event.clientY - rect.top) / rect.height) * size.h,
    };
    if (points.length === 1) {
      const next: [Point, Point] = [points[0], point];
      setPoints(next);
      commit(next);
      return;
    }
    setPoints([point]);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {photos.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "shrink-0 rounded-md border px-3 py-1.5 text-sm",
              item.id === photo.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            {VIEWS.find((view) => view.id === item.view)?.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={mode === "calibrate" ? "default" : "outline"} data-testid="calibrate-mode" onClick={() => { setMode("calibrate"); setPoints([]); }}>
          Calibrate
        </Button>
        <Button type="button" size="sm" variant={mode === "measure" ? "default" : "outline"} data-testid="measure-mode" onClick={() => { setMode("measure"); setPoints([]); }}>
          Measure
        </Button>
      </div>

      {mode === "calibrate" ? (
        <div className="block space-y-1.5">
          <Label htmlFor="scale-reference">Known distance in the photo</Label>
          <select
            id="scale-reference"
            data-testid="scale-reference"
            value={referenceId}
            onChange={(event) => setReferenceId(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:ring-2 focus:ring-ring"
          >
            {REFERENCES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {KINDS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`measure-${item.id}`}
              onClick={() => setKind(item.id)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm",
                kind === item.id ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-[#1c1915]">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt="Preparation photo for measurement"
            className="block h-auto w-full"
            onLoad={(event) => {
              const img = event.currentTarget;
              setSize({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
            }}
          />
          <svg
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
            viewBox={`0 0 ${size.w} ${size.h}`}
            onPointerDown={tap}
            data-testid="measure-canvas"
          >
            {calibration && (
              <line x1={calibration.a.x} y1={calibration.a.y} x2={calibration.b.x} y2={calibration.b.y} stroke="#2C5FA8" strokeWidth={Math.max(size.w, size.h) / 280} />
            )}
            {points.length === 2 && (
              <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke="#E3C27A" strokeWidth={Math.max(size.w, size.h) / 220} />
            )}
            {points.map((point, index) => (
              <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r={Math.max(size.w, size.h) / 90} fill="#FBF8F4" stroke="#2C453C" strokeWidth={Math.max(size.w, size.h) / 400} />
            ))}
          </svg>
        </div>
      </div>
      <p className="text-sm leading-relaxed" data-testid="measure-message">
        {message}
      </p>
      {calibration && (
        <p className="font-mono text-xs text-muted-foreground">
          Scale {calibration.pxPerMm.toFixed(1)} px/mm · {calibration.label}
        </p>
      )}
    </div>
  );
}

export type { Kind, ViewId };
