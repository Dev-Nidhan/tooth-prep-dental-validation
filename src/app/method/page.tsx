export const metadata = {
  title: "Method",
};

export default function MethodPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">How the check is made</p>
      <h1 className="mt-2 font-heading text-4xl font-light tracking-tight">Geometry first, then the clinical range</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        The browser and the Python script follow the same steps. The script is the readable form: <code className="font-mono text-xs">python/crown_prep.py</code>. Run it with <code className="font-mono text-xs">--pseudocode</code> to print the algorithm, or <code className="font-mono text-xs">--self-test</code> to check it against cones of known taper.
      </p>

      <pre className="mt-8 overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-xs leading-relaxed">{`INPUT
  prep STL in millimetres
  optional pre-op STL in the same coordinate frame
  optional photos, each with a known distance if you want millimetres
  taper, occlusal reduction, axial reduction, finish-line width
  material and FDI tooth

FIND THE INSERTION AXIS
  sample triangle centroids and outward normals
  try the coordinate axes, the principal axes, and a spread of directions
  keep the direction whose axial walls form one clean cone
  put the flat occlusal table at the positive end

MEASURE
  keep faces whose normals are nearly perpendicular to that axis
  walk from the occlusal table toward the gingiva in 0.3 mm slices
  stop where the radius leaves the straight wall
    (a die base past the margin drops out here)
  TOC = 2 × atan(how fast the radius shrinks toward the occlusal)
  in each of 8 sectors, an undercut is a rise in radius
    on the way to the occlusal table
  wall height = occlusal plane − finish line
  ratio = wall height / margin diameter

PHOTOS
  sharpness = variance of the Laplacian
  exposure = mean luminance and clipped pixels
  millimetres exist only after two points and a known distance:
    probe mark, or the diameter of a bur left in frame
  pixel distance / pixels-per-millimetre = the reading

COMPARE
  TOC: 6–12° meets, through 20° borderline, outside under 4° or over 25°
  molar walls ≥ 4 mm, other teeth ≥ 3 mm, ratio ≥ 0.4
  reduction and finish-line width against the material table
  missing reduction stays missing — it is not guessed`}</pre>

      <h2 className="mt-10 font-heading text-2xl tracking-tight">Run it on a file</h2>
      <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-xs leading-relaxed">{`python3 python/crown_prep.py \\
  --stl prep.stl \\
  --tooth 36 \\
  --material lithium_disilicate \\
  --occlusal-mm 1.8 \\
  --axial-mm 1.2 \\
  --finish-mm 1.0

python3 python/crown_prep.py --self-test
python3 python/crown_prep.py --pseudocode`}</pre>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        The script uses only the Python standard library for the mesh. Photo sharpness is scored when Pillow is installed (<code className="font-mono text-xs">pip install pillow</code>). Without it, the geometry check still runs. Add <code className="font-mono text-xs">--taper 14</code> when you trust your own angle more than the mesh. Add <code className="font-mono text-xs">--preop before.stl</code> only when both exports already share one scanner coordinate frame — there is no automatic alignment.
      </p>

      <h2 className="mt-10 font-heading text-2xl tracking-tight">What this will not do</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>It will not turn an uncalibrated intraoral photo into millimetres. Scale comes from a probe, a bur, or a number you type.</li>
        <li>It will not best-fit a pre-op scan to a prep. That alignment is its own problem.</li>
        <li>It will not read a full arch as one crown. Export the prepared tooth.</li>
        <li>It will not decide cement, a post, or whether to impression. The verdict is a teaching comparison.</li>
      </ul>
    </div>
  );
}
