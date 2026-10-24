import { MATERIALS, teachingBands, type MaterialId } from "@/lib/clinical";

export const metadata = {
  title: "Teaching ranges",
};

export default function ParametersPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reference</p>
      <h1 className="mt-2 font-heading text-4xl font-light tracking-tight">Ranges used in the check</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        These are teaching ranges for complete-crown preparations, not a private rubric. Programs differ by a few tenths of a millimetre. The taper bands follow Shillingburg’s textbook ideal and the 10–20° clinical window in Goodacre, Campagni, and Aquilino, Journal of Prosthetic Dentistry 2001. Wall height and the 0.4 height-to-width floor are from that same paper. Reduction follows the usual material minima in fixed prosthodontics.
      </p>

      <section className="mt-10">
        <h2 className="font-heading text-2xl tracking-tight">Total occlusal convergence</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The angle between opposing axial walls. Each wall contributes about half. A preparation that is 6° per wall is 12° total.
        </p>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Reading</th>
              <th className="py-2 pr-3 font-semibold">Call</th>
              <th className="py-2 font-semibold">What to do with it</th>
            </tr>
          </thead>
          <tbody>
            <Row reading="6–12°" call="Meets" note="Textbook taper. Retention is favoured if the walls are long enough." />
            <Row reading="12–20°" call="Borderline" note="Inside the clinical range. Still record it. Do not pretend it is 6°." />
            <Row reading="4–6° or 20–25°" call="Borderline" note="Very parallel risks binding. Steeper than 20° thins retention. Consider grooves or boxes." />
            <Row reading="Under 4° or over 25°" call="Outside" note="Unlikely to seat cleanly, or unlikely to stay seated with conventional cement." />
          </tbody>
        </table>
      </section>

      <section className="mt-10">
        <h2 className="font-heading text-2xl tracking-tight">Walls and resistance form</h2>
        <table className="mt-4 w-full border-collapse text-sm">
          <tbody>
            <Row reading="Molar height" call="≥ 4 mm" note="3–4 mm is borderline. Under 3 mm does not meet." />
            <Row reading="Premolar or anterior" call="≥ 3 mm" note="2.5–3 mm is borderline. Under 2.5 mm does not meet." />
            <Row reading="Height ÷ margin diameter" call="≥ 0.4" note="0.3–0.4 is borderline. This is the resistance-form floor from Goodacre et al." />
            <Row reading="Path of insertion" call="No rise" note="A sector that gets wider toward the occlusal will bind. 0.12 mm of rise is called an undercut." />
          </tbody>
        </table>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Scan wall height can sit about 0.2 mm short of a sharp corner. A mesh reading inside that tolerance of the target is still marked as meeting it, and the report says so.
        </p>
      </section>

      <section className="mt-10 space-y-8">
        <h2 className="font-heading text-2xl tracking-tight">Reduction by material</h2>
        {MATERIALS.map((material) => (
          <MaterialBlock key={material.id} id={material.id} label={material.label} finish={material.finish} />
        ))}
      </section>

      <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
        Sources to read beside this page: Goodacre CJ, Campagni WV, Aquilino SA. Tooth preparations for complete crowns: an art form based on scientific principles. J Prosthet Dent. 2001;85:363–376. Shillingburg HT et al., Fundamentals of Fixed Prosthodontics. Rosenstiel SF, Land MF, Fujimoto J., Contemporary Fixed Prosthodontics. Manufacturer minima for zirconia and lithium disilicate can be slightly tighter than the teaching band — follow the system you are actually cementing.
      </p>
    </div>
  );
}

function MaterialBlock({ id, label, finish }: { id: MaterialId; label: string; finish: string }) {
  const bands = teachingBands(id);
  return (
    <div>
      <h3 className="text-lg font-medium">{label}</h3>
      <p className="mt-1 text-sm text-muted-foreground">Finish line: {finish}.</p>
      <table className="mt-3 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <th className="py-2 font-semibold">Parameter</th>
            <th className="py-2 font-semibold">Meets</th>
            <th className="py-2 font-semibold">Still acceptable</th>
          </tr>
        </thead>
        <tbody>
          <BandRow name="Occlusal / incisal" band={bands.occlusal} />
          <BandRow name="Axial" band={bands.axial} />
          <BandRow name="Finish-line width" band={bands.finish} />
        </tbody>
      </table>
    </div>
  );
}

function BandRow({
  name,
  band,
}: {
  name: string;
  band: { idealMin: number; idealMax: number; acceptMin: number; acceptMax: number };
}) {
  return (
    <tr className="border-b border-border">
      <td className="py-2 pr-3">{name}</td>
      <td className="py-2 pr-3 font-mono">{band.idealMin.toFixed(1)}–{band.idealMax.toFixed(1)} mm</td>
      <td className="py-2 font-mono">{band.acceptMin.toFixed(1)}–{band.acceptMax.toFixed(1)} mm</td>
    </tr>
  );
}

function Row({ reading, call, note }: { reading: string; call: string; note: string }) {
  return (
    <tr className="border-b border-border align-top">
      <td className="py-2 pr-3 font-mono whitespace-nowrap">{reading}</td>
      <td className="py-2 pr-3 whitespace-nowrap">{call}</td>
      <td className="py-2 text-muted-foreground">{note}</td>
    </tr>
  );
}
