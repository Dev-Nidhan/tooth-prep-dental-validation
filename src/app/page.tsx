import Link from "next/link";
import { PrepSketch } from "@/components/prep-sketch";

const STEPS = [
  {
    n: "01",
    title: "Photograph the prep",
    body: "Live camera, the phone’s camera app, or the gallery. Five views: occlusal, buccal, lingual, mesial, distal. A photo is not a measurement until a probe mark or a bur of known diameter is in the frame.",
  },
  {
    n: "02",
    title: "Read the STL",
    body: "Total occlusal convergence, axial wall height, the height-to-width ratio, and sectors that get wider toward the occlusal. A die base past the margin is left out of the taper fit.",
  },
  {
    n: "03",
    title: "Compare it with the range",
    body: "Material-specific reduction and finish-line width, next to the taper bands used in fixed prosthodontics. Copy or print the note for a logbook.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">For the clinic and the simulation lab</p>
          <h1 className="mt-3 max-w-xl font-heading text-4xl font-light tracking-tight sm:text-5xl">
            Check the preparation before the impression.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            Finish Line looks at a crown preparation the way a fixed-prosthodontics instructor does: taper, wall height, path of insertion, and whether the reduction actually fits the material. Phone photos stay on the phone.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/analyze"
              data-testid="start-check"
              className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Check a preparation
            </Link>
            <Link
              href="/analyze?demo=ideal"
              data-testid="open-ideal-demo"
              className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-card px-5 text-sm font-medium hover:bg-secondary"
            >
              Open the 12° teaching model
            </Link>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <PrepSketch />
          <div className="grid grid-cols-3 border-t border-border bg-card">
            <HomeStat label="TOC" value="12°" note="Optimal band" />
            <HomeStat label="Wall" value="4.2 mm" note="Molar target" />
            <HomeStat label="Path" value="Clear" note="No undercut" />
          </div>
        </div>
      </div>

      <ol className="mt-14 grid gap-4 md:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.n} className="rounded-lg border border-border bg-card p-5">
            <p className="font-mono text-xs text-muted-foreground">{step.n}</p>
            <h2 className="mt-2 font-heading text-xl tracking-tight">{step.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>

      <section className="mt-14 grid gap-6 rounded-lg border border-border bg-card p-5 sm:p-8 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">What the numbers mean</p>
          <h2 className="mt-2 font-heading text-2xl tracking-tight">Taper is not a guess from a blurry photo.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Total occlusal convergence comes from the mesh: how fast the preparation narrows toward the occlusal table. About 6–12° is the textbook band. Up to 20° is the clinical range described by Goodacre, Campagni, and Aquilino. Past that, retention falls off unless you add grooves, boxes, or a different cement plan.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Occlusal reduction, axial reduction, and finish-line width are only reported in millimetres when you type a probe reading or calibrate a photo. The app will say the check is incomplete rather than invent a clearance.
          </p>
        </div>
        <div className="space-y-3">
          <RangeRow name="Molar wall height" value="≥ 4 mm" />
          <RangeRow name="Premolar and anterior walls" value="≥ 3 mm" />
          <RangeRow name="Height-to-width ratio" value="≥ 0.4" />
          <RangeRow name="Lithium disilicate occlusal" value="1.5–2.0 mm" />
          <RangeRow name="Full metal occlusal" value="1.0–1.5 mm" />
          <Link href="/parameters" className="inline-block pt-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
            Full teaching ranges
          </Link>
        </div>
      </section>

      <section className="mt-8 flex flex-col justify-between gap-4 rounded-lg border border-border p-5 sm:flex-row sm:items-center sm:p-6">
        <div>
          <h2 className="font-heading text-xl tracking-tight">Try the three teaching models</h2>
          <p className="mt-1 text-sm text-muted-foreground">A 12° cone, a 28° cone, and a prep with one wall that bulges toward the occlusal. No file required.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/analyze?demo=overtapered" className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm hover:bg-secondary">
            28° taper
          </Link>
          <Link href="/analyze?demo=undercut" className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm hover:bg-secondary">
            Undercut
          </Link>
        </div>
      </section>
    </div>
  );
}

function HomeStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-light tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

function RangeRow({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 text-sm">
      <span>{name}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}
