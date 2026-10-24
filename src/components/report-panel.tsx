"use client";

import { CopyIcon, PrinterIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  overallLabel,
  statusLabel,
  toothLabel,
  type ClinicalReport,
  type ParameterStatus,
} from "@/lib/clinical";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<ParameterStatus, string> = {
  pass: "border-optimal/30 bg-optimal/10 text-optimal",
  caution: "border-warning/30 bg-warning/10 text-warning",
  fail: "border-critical/30 bg-critical/10 text-critical",
  missing: "border-border bg-muted text-muted-foreground",
};

const OVERALL_CLASS = {
  meets: "border-optimal/40 bg-optimal/10",
  review: "border-warning/40 bg-warning/10",
  rework: "border-critical/40 bg-critical/10",
  incomplete: "border-border bg-muted",
};

export function ReportPanel({
  report,
  onCopy,
  copied,
}: {
  report: ClinicalReport;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <section className="space-y-4" data-testid="report-panel">
      <p className="hidden font-heading text-lg print:block">Finish Line · crown preparation check</p>
      <div className={cn("rounded-lg border p-4 print-break", OVERALL_CLASS[report.overall])}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Verdict</p>
        <h2 className="mt-1 font-heading text-2xl tracking-tight" data-testid="report-status">
          {overallLabel(report.overall)}
        </h2>
        <p className="mt-2 text-sm leading-relaxed">{report.summary}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          {report.toothFdi ? `FDI ${report.toothFdi} · ${toothLabel(report.toothFdi)}` : "No tooth selected"} · {report.materialLabel}
        </p>
      </div>

      <ul className="space-y-2">
        {report.parameters.map((item) => (
          <li key={item.id} className="rounded-lg border border-border bg-card p-3 print-break" data-testid={`parameter-${item.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.target}</p>
              </div>
              <div className="text-right">
                <p
                  className="font-mono text-2xl font-light tracking-tight"
                  data-testid={
                    item.id === "occlusal" ? "clearance-metric" : item.id === "toc" ? "taper-metric" : item.id === "wall_height" ? "wall-height-metric" : undefined
                  }
                >
                  {item.value == null ? "—" : item.unit === "deg" ? `${item.value.toFixed(1)}°` : item.unit === "ratio" ? item.value.toFixed(2) : item.value.toFixed(2)}
                  {item.value != null && item.unit === "mm" ? <span className="ml-1 text-sm text-muted-foreground">mm</span> : null}
                </p>
                <span className={cn("mt-1 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]", STATUS_CLASS[item.status])}>
                  {statusLabel(item.status)}
                </span>
              </div>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.note}</p>
          </li>
        ))}
      </ul>

      {report.geometryNotes.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {report.geometryNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {report.photoNotes.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {report.photoNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <div className="no-print flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onCopy} data-testid="copy-report-button">
          <CopyIcon size={16} />
          {copied ? "Copied" : "Copy report"}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()} data-testid="print-report-button">
          <PrinterIcon size={16} />
          Print
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{report.disclaimer}</p>
    </section>
  );
}
