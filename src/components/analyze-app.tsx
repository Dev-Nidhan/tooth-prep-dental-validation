"use client";

import { CubeIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MeasurePanel, type Calibration, type Kind } from "@/components/measure-panel";
import { PhotoDesk, type PhotoShot } from "@/components/photo-desk";
import { ReportPanel } from "@/components/report-panel";
import { ToothChart } from "@/components/tooth-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildReport,
  MATERIALS,
  reportPlainText,
  toothLabel,
  type MaterialId,
  type ReadingSource,
} from "@/lib/clinical";
import { analyzeTriangles, type MeshGeometry } from "@/lib/geometry";
import { qualityFromUrl } from "@/lib/image-quality";
import { parseStl } from "@/lib/stl";
import { parseDecimal, cn } from "@/lib/utils";
import type { ViewId } from "@/lib/views";

const PrepViewer = dynamic(() => import("@/components/prep-viewer").then((mod) => mod.PrepViewer), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted-foreground">Opening the model…</div>,
});

const STEPS = [
  { id: "case", label: "Case" },
  { id: "photos", label: "Photos" },
  { id: "scan", label: "Scan" },
  { id: "measure", label: "Measure" },
  { id: "report", label: "Report" },
] as const;

type Step = (typeof STEPS)[number]["id"];

const DEMOS = {
  ideal: { path: "/demos/ideal-12.stl", name: "Teaching model · 12° taper" },
  overtapered: { path: "/demos/overtapered-28.stl", name: "Teaching model · 28° taper" },
  undercut: { path: "/demos/undercut-buccal.stl", name: "Teaching model · buccal undercut" },
} as const;

export function AnalyzeApp() {
  const params = useSearchParams();
  const started = useRef(false);
  const stlInput = useRef<HTMLInputElement>(null);
  const photosRef = useRef<PhotoShot[]>([]);
  const [step, setStep] = useState<Step>("case");
  const [tooth, setTooth] = useState<number | null>(36);
  const [material, setMaterial] = useState<MaterialId>("lithium_disilicate");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<PhotoShot[]>([]);
  const [activeView, setActiveView] = useState<ViewId>("occlusal");
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [calibrations, setCalibrations] = useState<Record<string, Calibration | undefined>>({});
  const [geometry, setGeometry] = useState<MeshGeometry | null>(null);
  const [stlName, setStlName] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [occlusal, setOcclusal] = useState("");
  const [axial, setAxial] = useState("");
  const [finish, setFinish] = useState("");
  const [taperOverride, setTaperOverride] = useState("");
  const [heightOverride, setHeightOverride] = useState("");
  const [sources, setSources] = useState<Partial<Record<Kind, ReadingSource>>>({});
  const [copied, setCopied] = useState(false);

  photosRef.current = photos;
  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
    };
  }, []);

  async function readStl(buffer: ArrayBuffer, name: string) {
    setBusy("Reading the mesh…");
    setScanError(null);
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const mesh = parseStl(buffer);
      setGeometry(analyzeTriangles(mesh));
      setStlName(name);
      return true;
    } catch (error) {
      setGeometry(null);
      setStlName(null);
      setScanError(error instanceof Error ? error.message : "Could not read that STL.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function loadDemo(kind: keyof typeof DEMOS) {
    const demo = DEMOS[kind];
    setBusy("Loading the teaching model…");
    setScanError(null);
    try {
      const response = await fetch(demo.path);
      if (!response.ok) throw new Error("The teaching model could not be loaded.");
      const ok = await readStl(await response.arrayBuffer(), demo.name);
      if (!ok) return;
      setTooth(36);
      setMaterial("lithium_disilicate");
      setOcclusal("1.8");
      setAxial("1.2");
      setFinish("1.0");
      setSources({ occlusal: "entered", axial: "entered", finish: "entered" });
      setTaperOverride("");
      setHeightOverride("");
      setStep("report");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "The teaching model could not be loaded.");
      setBusy(null);
    }
  }

  useEffect(() => {
    if (started.current) return;
    const demo = params.get("demo");
    if (demo === "ideal" || demo === "overtapered" || demo === "undercut") {
      started.current = true;
      void loadDemo(demo);
    }
    // Only the first landing should auto-load a teaching model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function addFiles(items: { view: ViewId; file: File }[]) {
    const created: PhotoShot[] = [];
    for (const item of items) {
      const url = URL.createObjectURL(item.file);
      let quality: PhotoShot["quality"] = null;
      let qualityError: string | null = null;
      try {
        quality = await qualityFromUrl(url);
      } catch (error) {
        qualityError = error instanceof Error ? error.message : "Could not read that image.";
      }
      created.push({
        id: crypto.randomUUID(),
        view: item.view,
        url,
        name: item.file.name,
        quality,
        qualityError,
      });
    }
    const replaced = new Set(created.map((photo) => photo.view));
    photosRef.current.filter((photo) => replaced.has(photo.view)).forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotos((current) => [...current.filter((photo) => !replaced.has(photo.view)), ...created]);
    setSelectedPhotoId(created[created.length - 1]?.id ?? null);
    if (created[0]) setActiveView(created[0].view);
  }

  function removePhoto(id: string) {
    const photo = photosRef.current.find((item) => item.id === id);
    if (photo) URL.revokeObjectURL(photo.url);
    setPhotos((current) => current.filter((item) => item.id !== id));
    if (selectedPhotoId === id) setSelectedPhotoId(null);
  }

  function setReading(kind: Kind, mm: number) {
    const text = mm.toFixed(2);
    if (kind === "occlusal") setOcclusal(text);
    if (kind === "axial") setAxial(text);
    if (kind === "finish") setFinish(text);
    setSources((current) => ({ ...current, [kind]: "photo" }));
  }

  const report = useMemo(
    () =>
      buildReport({
        geometry,
        tooth,
        material,
        taperDeg: parseDecimal(taperOverride),
        occlusalMm: parseDecimal(occlusal),
        axialMm: parseDecimal(axial),
        finishMm: parseDecimal(finish),
        heightMm: parseDecimal(heightOverride),
        sources,
        photoNotes: photos.map((photo) => {
          const quality = photo.quality?.label ?? photo.qualityError ?? "not scored";
          const scale = calibrations[photo.id] ? "calibrated" : "no scale";
          return `${photo.view}: ${quality}, ${scale}`;
        }),
      }),
    [geometry, tooth, material, taperOverride, occlusal, axial, finish, heightOverride, sources, photos, calibrations],
  );

  async function copyReport() {
    const text = reportPlainText(report, note);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      window.prompt("Copy this report:", text);
    }
  }

  function go(next: Step) {
    setStep(next);
    if (window.innerWidth >= 1024) {
      document.getElementById(`section-${next}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const stepIndex = STEPS.findIndex((item) => item.id === step);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:pb-16 lg:pt-6">
      <div className="mb-4 max-w-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Chairside and teaching lab</p>
        <h1 className="mt-1 font-heading text-3xl tracking-tight sm:text-4xl">Check this preparation</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {tooth ? `FDI ${tooth}, ${toothLabel(tooth)}.` : "Pick a tooth."} The scan estimates taper, wall height, and undercuts. Reduction still needs a probe, or a photo with something of known size in the frame.
        </p>
      </div>

      <nav className="no-print sticky top-14 z-30 -mx-4 mb-4 border-b border-border bg-background px-4 lg:static lg:mx-0 lg:mb-6 lg:border-0 lg:bg-transparent lg:px-0">
        <ol className="flex gap-1 overflow-x-auto py-3 lg:py-0">
          {STEPS.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                data-testid={`step-${item.id}`}
                onClick={() => go(item.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm whitespace-nowrap",
                  step === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
                )}
              >
                <span className="mr-1 font-mono text-[10px]">{index + 1}</span>
                {item.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section id="section-case" className={cn("scroll-mt-28 rounded-lg border border-border bg-card p-4 sm:p-6", step === "case" ? "block" : "hidden lg:block")}>
            <PanelTitle kicker="Case" title="Tooth and material" />
            <div className="mt-4 space-y-5">
              <ToothChart value={tooth} onChange={setTooth} />
              <div className="grid gap-2 sm:grid-cols-2">
                {MATERIALS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`material-${item.id}`}
                    onClick={() => setMaterial(item.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      material === item.id ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.blurb}</span>
                  </button>
                ))}
              </div>
              <div className="block space-y-1.5">
                <Label htmlFor="case-note">Session note</Label>
                <Input id="case-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Lab session, student number, or what you changed" />
              </div>
            </div>
          </section>

          <section id="section-photos" className={cn("scroll-mt-28 rounded-lg border border-border bg-card p-4 sm:p-6", step === "photos" ? "block" : "hidden lg:block")}>
            <PanelTitle kicker="Photos" title="Five views, from the camera or the gallery" />
            <div className="mt-4">
              <PhotoDesk
                photos={photos}
                activeView={activeView}
                onActiveView={setActiveView}
                onAddFiles={addFiles}
                onRemove={removePhoto}
                selectedId={selectedPhotoId}
                onSelect={setSelectedPhotoId}
              />
            </div>
          </section>

          <section id="section-scan" className={cn("scroll-mt-28 rounded-lg border border-border bg-card p-4 sm:p-6", step === "scan" ? "block" : "hidden lg:block")}>
            <PanelTitle kicker="Scan" title="Preparation STL" />
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Export the prepared tooth in millimetres. A die base past the margin is ignored when the finish line is a change in the wall. A full-arch scan will not read as one preparation.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button type="button" data-testid="upload-scan-button" onClick={() => stlInput.current?.click()}>
                <UploadSimpleIcon size={18} />
                Choose STL
              </Button>
              <input
                ref={stlInput}
                type="file"
                accept=".stl,model/stl,application/sla"
                className="sr-only"
                data-testid="upload-scan-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void file.arrayBuffer().then((buffer) => readStl(buffer, file.name));
                }}
              />
              <Button type="button" variant="outline" data-testid="demo-ideal-button" onClick={() => void loadDemo("ideal")}>
                Ideal 12°
              </Button>
              <Button type="button" variant="outline" data-testid="demo-overtaper-button" onClick={() => void loadDemo("overtapered")}>
                Overtapered 28°
              </Button>
              <Button type="button" variant="outline" data-testid="demo-undercut-button" onClick={() => void loadDemo("undercut")}>
                Buccal undercut
              </Button>
            </div>
            {busy && <p className="mt-3 text-sm">{busy}</p>}
            {scanError && (
              <p className="mt-3 text-sm text-critical" data-testid="scan-error">
                {scanError}
              </p>
            )}
            <div className="mt-4 overflow-hidden rounded-lg border border-border bg-[#f4f0e8]">
              <div className="h-[340px] sm:h-[460px]">
                {geometry ? (
                  <PrepViewer positions={geometry.positions} colors={geometry.colors} />
                ) : (
                  <div className="grid h-full place-items-center px-6 text-center">
                    <div>
                      <CubeIcon size={36} weight="duotone" className="mx-auto text-primary" />
                      <p className="mt-3 text-sm text-muted-foreground">No mesh yet. Load an STL or open a teaching model.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {geometry && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">{stlName} · drag to orbit · confidence {geometry.confidence}</p>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="TOC" value={`${geometry.totalOcclusalConvergenceDeg.toFixed(1)}°`} />
                  <Metric label="Wall height" value={`${geometry.axialWallHeightMm.toFixed(2)} mm`} />
                  <Metric label="Height / width" value={geometry.heightToWidth.toFixed(2)} />
                  <Metric label="Undercut" value={`${geometry.undercutMm.toFixed(2)} mm`} />
                </dl>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-optimal" /> In range</li>
                  <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-warning" /> Steep or very parallel</li>
                  <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-critical" /> Undercut</li>
                  <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-[#e8d9c7]" /> Occlusal table</li>
                </ul>
                <div data-testid="taper-rose">
                  <p className="mb-2 text-xs text-muted-foreground">Wall angle in eight sectors around the insertion axis. Match the colours to the model by eye — the file does not know which side is buccal.</p>
                  <div className="grid grid-cols-8 items-end gap-1">
                    {geometry.sectors.map((sector) => (
                      <div key={sector.index} className="text-center">
                        <div
                          className={cn("mx-auto w-full rounded-sm", sector.undercutMm >= 0.12 ? "bg-critical" : sector.wallDeg < 2 || sector.wallDeg > 12.5 ? "bg-warning" : "bg-optimal")}
                          style={{ height: `${Math.min(72, Math.max(10, Math.abs(sector.wallDeg) * 3))}px` }}
                        />
                        <p className="mt-1 font-mono text-[10px]">{sector.wallDeg.toFixed(0)}°</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section id="section-measure" className={cn("scroll-mt-28 rounded-lg border border-border bg-card p-4 sm:p-6", step === "measure" ? "block" : "hidden lg:block")}>
            <PanelTitle kicker="Measure" title="Reduction, from a scale or a probe" />
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Tap a probe mark or the sides of a bur of known diameter, then tap the gap you want. Typing a caliper reading is just as valid. Leave taper and wall height blank to keep the scan.
            </p>
            <div className="mt-4">
              <MeasurePanel
                photos={photos}
                selectedId={selectedPhotoId}
                onSelect={setSelectedPhotoId}
                calibrations={calibrations}
                onCalibrate={(photoId, calibration) => setCalibrations((current) => ({ ...current, [photoId]: calibration }))}
                onReading={setReading}
              />
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field id="occlusal-input" label="Occlusal reduction (mm)" value={occlusal} testId="occlusal-input" onChange={(value) => { setOcclusal(value); setSources((current) => ({ ...current, occlusal: "entered" })); }} />
              <Field id="axial-input" label="Axial reduction (mm)" value={axial} testId="axial-input" onChange={(value) => { setAxial(value); setSources((current) => ({ ...current, axial: "entered" })); }} />
              <Field id="finish-input" label="Finish-line width (mm)" value={finish} testId="finish-input" onChange={(value) => { setFinish(value); setSources((current) => ({ ...current, finish: "entered" })); }} />
              <Field id="taper-override" label="Taper override (degrees)" value={taperOverride} testId="taper-override" placeholder={geometry ? geometry.totalOcclusalConvergenceDeg.toFixed(1) : "From the scan"} onChange={setTaperOverride} />
              <Field id="height-override" label="Wall height override (mm)" value={heightOverride} testId="height-override" placeholder={geometry ? geometry.axialWallHeightMm.toFixed(2) : "From the scan"} onChange={setHeightOverride} />
            </div>
          </section>

          <section className={step === "report" ? "block lg:hidden" : "hidden"}>
            <ReportPanel report={report} onCopy={() => void copyReport()} copied={copied} />
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <ReportPanel report={report} onCopy={() => void copyReport()} copied={copied} />
          </div>
        </aside>
      </div>

      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card p-3 lg:hidden">
        <div className="mx-auto flex max-w-6xl gap-2">
          <Button type="button" variant="outline" className="flex-1" disabled={stepIndex === 0} onClick={() => go(STEPS[Math.max(0, stepIndex - 1)].id)}>
            Back
          </Button>
          {step === "report" ? (
            <Button type="button" className="flex-[2]" onClick={() => void copyReport()}>
              {copied ? "Copied" : "Copy report"}
            </Button>
          ) : (
            <Button type="button" className="flex-[2]" data-testid="continue-button" onClick={() => go(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].id)}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{kicker}</p>
      <h2 className="mt-1 font-heading text-2xl tracking-tight">{title}</h2>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-light tracking-tight">{value}</dd>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testId: string;
}) {
  return (
    <div className="block space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="decimal" value={value} placeholder={placeholder} data-testid={testId} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
