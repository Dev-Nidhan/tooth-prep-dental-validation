# Finish Line

A chairside and teaching-lab check for complete-crown preparations. It reads a preparation STL, optional intraoral photos, and the reduction you measured, then compares them with the ranges used for taper, wall height, path of insertion, and material thickness.

Photos and meshes stay in the browser. Nothing is uploaded.

This is a teaching aid, not a medical device. Confirm reduction with a periodontal probe or a calibrated scanner, and follow your program’s rubric, before you temporize or cement.

## Run the website

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:38471](http://127.0.0.1:38471).

On a phone, use the same Wi-Fi address the terminal prints. Live camera needs a secure page (`https`) or `localhost`. Gallery and the system camera work as ordinary file pickers.

```bash
npm run build
npm start
```

No API keys or environment variables are required. A Vercel (or any Node) deploy of this Next.js app is enough to share it with a class.

## Use it

1. Pick the FDI tooth and the restorative material.
2. Add photos with **Live camera**, **System camera**, or **Gallery**. Five slots: occlusal, buccal, lingual, mesial, distal.
3. Load a preparation STL, or open a teaching model (12° taper, 28° taper, buccal undercut).
4. For millimetres on a photo, tap a known distance first (a probe mark or a bur diameter), then tap the gap.
5. Or type probe and caliper readings. Leave taper and wall height blank to keep the scan estimate.
6. Copy or print the report.

The model is coloured around the insertion axis: green within the wall-angle band, amber when a sector is very steep or very parallel, terracotta when that sector gets wider toward the occlusal. The file does not know which side is buccal — match the colours to the model by eye.

## The Python check

`python/crown_prep.py` is the same algorithm, runnable without the website. It needs only the Python standard library.

```bash
python3 python/crown_prep.py --self-test
python3 python/crown_prep.py --pseudocode

python3 python/crown_prep.py \
  --stl prep.stl \
  --tooth 36 \
  --material lithium_disilicate \
  --occlusal-mm 1.8 \
  --axial-mm 1.2 \
  --finish-mm 1.0
```

Optional photo sharpness scoring: `pip install pillow`, then pass `--image photo.jpg`.

`npm run test:geometry` runs the Python self-test and the same checks in the browser engine against the teaching STL files in `public/demos/`.

## Clinical ranges, in short

- Total occlusal convergence: 6–12° meets, up to 20° borderline, outside under 4° or over 25°.
- Axial wall height: molars ≥ 4 mm, premolars and anteriors ≥ 3 mm.
- Occlusocervical height ÷ margin diameter ≥ 0.4.
- Reduction and finish-line width depend on the material. The full table is on the Ranges page.

Taper and the 10–20° clinical window follow Goodacre, Campagni, and Aquilino, *Journal of Prosthetic Dentistry* 2001, alongside Shillingburg’s textbook ideal. A scan can sit about 0.2 mm off a sharp line angle; the report says when a wall height is inside that tolerance.
