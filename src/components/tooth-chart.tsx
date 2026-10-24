"use client";

import { cn } from "@/lib/utils";

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export function ToothChart({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (fdi: number) => void;
}) {
  return (
    <div className="space-y-3 overflow-x-auto" data-testid="tooth-chart">
      <div className="min-w-[36rem] space-y-3">
      <Arch label="Maxillary" teeth={UPPER} value={value} onChange={onChange} />
      <Arch label="Mandibular" teeth={LOWER} value={value} onChange={onChange} />
      </div>
      <div className="flex justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <span>Patient right</span>
        <span>Patient left</span>
      </div>
    </div>
  );
}

function Arch({
  label,
  teeth,
  value,
  onChange,
}: {
  label: string;
  teeth: number[];
  value: number | null;
  onChange: (fdi: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
        {teeth.map((fdi) => {
          const selected = value === fdi;
          return (
            <button
              key={fdi}
              type="button"
              data-testid={`tooth-${fdi}`}
              aria-pressed={selected}
              onClick={() => onChange(fdi)}
              className={cn(
                "h-9 rounded-md border font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-secondary",
              )}
            >
              {fdi}
            </button>
          );
        })}
      </div>
    </div>
  );
}
