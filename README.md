# Grid & Fretwork Math: 31-Bit Bitmask Nonogram Proofs, Half-Pixel EDT Pinhole Sealing, 4-Connected Marching Squares & Vector PDF Tiling

Zero-dependency JavaScript / Node.js discrete grid, contour-tracing, and print-geometry solvers for **uniqueness-verified Nonogram picture logic puzzles (with mid-game continuation & cell-by-cell lookahead contradiction proofs)**, **4-connected Marching Squares closed-loop vector contour tracing (`99.2%+` pixel-to-vector IoU)**, **half-pixel `(2W+1)×(2H+1)` Felzenszwalb-Huttenlocher Euclidean Distance Transform (`EDT`) wire-gauge (`#65–#44`) pinhole sealing**, **`40 px/in` rational cut-to-cut outer dimension calibration (`304.80 mm` / `0.00 mm` discrepancy)**, **scroll-saw & vinyl stencil floating-island auto-bridging**, and **zero-font-payload bilingual `/ToUnicode` vector PDF scanline merging + 1:1 US Letter / A4 poster tiling**.

- **Interactive Field Guide & Live Verifier**: [https://kaiyilu.github.io/grid-and-fretwork-math/](https://kaiyilu.github.io/grid-and-fretwork-math/)
- **Source Modules**: [`./src/index.mjs`](./src/index.mjs) & [`./src/contourAndEdt.mjs`](./src/contourAndEdt.mjs) (Pure ES Modules, `0` npm dependencies, browser & Node.js 18+)
- **Run Unit Tests**: `npm test` / `node --test` (`14` passing `node:test` suites)
- **Run CLI Demo**: `node ./src/index.mjs`

---

## Why Discrete Binary Grids Unify Logic Puzzles & Physical Fretwork CAD

Converting a continuous photograph into either a **solvable Nonogram puzzle** or a **cut-ready wood scroll-saw / Mylar stencil pattern** reduces to constrained optimization over a binary matrix $G \in \{0, 1\}^{H \times W}$:

1. **Ambiguous "Guessing" Nonograms (`Switching Components`)**: Thresholding an image into an $R \times C$ pixel grid and emitting row/column run lengths frequently embeds $2 \times 2$ alternating checkerboards $\bigl(\begin{smallmatrix}1 & 0\\0 & 1\end{smallmatrix}\bigr) \leftrightarrow \bigl(\begin{smallmatrix}0 & 1\\1 & 0\end{smallmatrix}\bigr)$. Both states satisfy identical row/column clues, forcing human solvers to guess blindly unless puzzle generators prove `solutionCount === 1` and `lineSolvable === true`.
2. **Stencil & Fretwork "Dropout Islands"**: Thresholding a portrait or lettering plaque creates interior solid regions ($G_{y,x} = 1$, such as the counter inside `O`, `A`, `B`, or eyes inside a bright face cutout) completely surrounded by cut void ($G_{y,x} = 0$). On a scroll saw, laser cutter, or Cricut blade, unanchored interior islands fall onto the shop floor the moment the perimeter waste cut closes.
3. **Zero-Width Diagonal Corners**: 8-connected raster tracers treat diagonal pixel touches $(x, y) \leftrightarrow (x+1, y+1)$ as "connected," yet a physical kerf has zero cross-sectional wood fiber across a point vertex—snapping immediately under saw vibration.
4. **Blade Chatter vs. Sawdust Scorch**: Pairing thin `1/8"` Baltic birch with a coarse `#7` blade engages fewer than `1.5` teeth at once (ripping bottom veneers on the upstroke), whereas cutting `3/4"` hard maple with a `#1` blade traps sawdust across `15` engaged teeth and burns cherry/maple edges black.

---

## Core Mathematical Solvers (`src/index.mjs`)

### 1. $O(k \cdot N^2)$ 31-Bit Bitmask Nonogram Line Deduction (`deduceNonogramLine`)

Given a line of length $N \le 31$, ordered contiguous block clues $R = [r_0, r_1, \dots, r_{k-1}]$, a bitmask of already proven filled cells $M_{\text{fill}}$, and proven empty cells $M_{\text{empty}}$ (where cell $i$ maps to bit $2^i$):

1. **Suffix Minimum Span**: Precompute minimum cells required by runs $i \dots k-1$ separated by mandatory 1-cell empty gaps:
   $$\text{minSpan}[i] = r_i + 1 + \text{minSpan}[i+1], \qquad \text{minSpan}[k-1] = r_{k-1}$$
2. **Memoized Bitmask Dynamic Programming**: State $(i, s)$ evaluates all valid placements of run $r_i$ at start index $p \in [s,\; N - \text{minSpan}[i]]$ using register bit-shifts:
   $$B(p, r_i) = (2^{r_i} - 1) \ll p$$
   A placement is admissible iff:
   - Leading gap bits $(2^p - 2^s) \land M_{\text{fill}} = 0$ (advancing $p$ terminates early as soon as bit $p-1 \in M_{\text{fill}}$),
   - Run block $B(p, r_i) \land M_{\text{empty}} = 0$, and
   - Mandatory trailing separator bit $2^{p + r_i} \land M_{\text{fill}} = 0$ (when $p + r_i < N$).
3. **Exact Forced Intersection via De Morgan Complement**: Accumulating bitwise unions $U_{\text{fill}}$ and $U_{\text{empty}}$ across all valid suffix completions yields every cell invariant across 100% of admissible configurations in a single XOR:
   $$F_{\text{fill}} = (2^N - 1) \oplus U_{\text{empty}}, \qquad F_{\text{empty}} = (2^N - 1) \oplus U_{\text{fill}}$$

### 2. Iterative Queue Propagation, Mid-Game Continuation & Lookahead Contradiction Proofs (`solveNonogramBitmask`, `proveNonogramLookaheadStep`)

`solveNonogramBitmask(rowClues, colClues, { maxSolutions, partialGrid })` maintains dirty bitqueues over rows and columns, optionally seeded from a mid-game `partialGrid` (`1` = filled `■`, `-1` = crossed `×`, `0` = unknown) so solvers continue from half-finished boards without restarting from blank.

- If queue exhaustion resolves all $R \times C$ cells (`unresolvedAfterLinePass === 0`), the puzzle is proven **purely human line-solvable** (`lineSolvable: true`, `unique: true`) with zero trial-and-error bifurcation.
- When single-line bitmask DP stalls on a uniquely solvable puzzle, `proveNonogramLookaheadStep(rowClues, colClues, partialGrid)` runs 1-ply `Reductio ad Absurdum` trial assumptions (`Assume RrCc = ×` or `■`) and selects the shortest contradiction cascade, returning numbered `subSteps` (`[{ stepNumber, axis, lineIndex, forcedFilledIndices, forcedEmptyIndices, validConfigurations, contradiction, reason }]`) culminating in the exact contradicting row/column (`validConfigurations === 0`).
- Minimum-entropy backtracking caps search at `maxSolutions = 2` to block ambiguous $2 \times 2$ switching components (`solutionCount >= 2`) before exporting photo-generated grids.

### 3. 2D 4-Connected BFS Dropout Audit & Multi-Hop Euclidean Bridging (`detectFloatingIslands`, `autoBridgeIslands`)

Given a flat binary `keepMask` of size $W \times H$ (`1` = solid wood/stencil sheet, `0` = cut kerf/void):

1. **Perimeter-Seeded 4-Connected Flood Fill**: Seed a FIFO queue with all border pixels $(x \in \{0, W-1\} \lor y \in \{0, H-1\})$ where $\text{keepMask}[yW + x] = 1$. Traverse strictly orthogonal Von Neumann neighbors $(\pm 1, \pm W)$ so zero-width diagonal corners are never misclassified as structural wood bridges.
2. **Dropout Component Labelling**: Any remaining solid pixel with `stateMask === 0` belongs to an unanchored interior island $I_m$, extracted with pixel area, bounding box, centroid, and boundary contour indices $\partial I_m$.
3. **Iterative Shortest-Euclidean Tab Synthesis**: While unanchored islands remain, `autoBridgeIslands` locates the global minimum Euclidean gap between the current anchored boundary $\partial A$ and all floating island boundaries $\bigcup_m \partial I_m$:
   $$(p^*, q^*) = \arg\min_{p \in \partial A,\; q \in \bigcup \partial I_m} \|p - q\|_2^2$$
   A 4-connected supercover stroke of circular brush radius $r_{\text{px}}$ (`bridgeRadiusPx`) stamps a structural wood/vinyl tab across $[p^*, q^*]$, promoting that island into $A$ so nested concentric islands (e.g., pupil inside an iris ring) cascade across short local hops rather than slicing across the entire plaque.

### 4. Scroll Saw 3-Tooth Engagement Law & Wire-Gauge Drill Table (`recommendScrollSawBlade`)

To prevent thin stock from chattering on the upstroke while keeping gullets open enough to eject hardwood chips without friction scorching, blade pitch ($\text{TPI}$, teeth per inch) must keep at least **3 teeth** engaged in stock thickness $t_{\text{in}}$ simultaneously:

$$\text{TPI}_{\min} = \frac{3}{t_{\text{in}}}, \qquad N_{\text{teeth}} = t_{\text{in}} \cdot \text{TPI} \in [3,\; 8]$$

| Blade Size | Blade Width | Kerf Thickness | Pitch (TPI) | Min Stock ($3/\text{TPI}$) | Wire-Gauge Pilot Drill | Fractional Drill | Primary Woodshop Application |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `#2/0` | `0.022"` (`0.56 mm`) | `0.010"` (`0.25 mm`) | `28` | `0.107"` (stack `< 3/32"`) | `#65` (`0.035"` / `0.89 mm`) | `1/32"`–`3/64"` | Veneer marquetry & micro portrait veining |
| `#0` | `0.024"` (`0.61 mm`) | `0.011"` (`0.28 mm`) | `25` | `0.120"` (`1/8"`) | `#63` (`0.037"` / `0.94 mm`) | `3/64"` (`0.047"`) | `1/8"` Baltic birch & delicate ornament lace |
| `#1` | `0.029"` (`0.74 mm`) | `0.012"` (`0.30 mm`) | `20` | `0.150"` (`3/16"`) | `#60` (`0.040"` / `1.02 mm`) | `3/64"` (`0.047"`) | `1/8"`–`1/4"` portrait fretwork & stack cuts |
| `#3` | `0.034"` (`0.86 mm`) | `0.014"` (`0.36 mm`) | `16` | `0.188"` (`3/16"`–`1/4"`) | `#58` (`0.042"` / `1.07 mm`) | `3/64"` (`0.047"`) | `1/4"`–`3/8"` Baltic birch ornaments (shop go-to) |
| `#5` | `0.041"` (`1.04 mm`) | `0.016"` (`0.41 mm`) | `12.5` | `0.240"` (`1/4"`–`1/2"`) | `#55` (`0.052"` / `1.32 mm`) | `1/16"` (`0.063"`) | `3/8"`–`1/2"` name plaques, puzzles & general curves |
| `#7` | `0.045"` (`1.14 mm`) | `0.018"` (`0.46 mm`) | `11.5` | `0.261"` (`1/2"`–`3/4"`) | `#53` (`0.0595"` / `1.51 mm`) | `1/16"` (`0.063"`) | `1/2"`–`3/4"` walnut, cherry & maple signs |
| `#9` | `0.053"` (`1.35 mm`) | `0.019"` (`0.48 mm`) | `11` | `0.273"` (`3/4"`–`1.25"`) | `#50` (`0.070"` / `1.78 mm`) | `5/64"` (`0.078"`) | `3/4"`–`1.25"` dense hardwood & intarsia |
| `#12` | `0.062"` (`1.57 mm`) | `0.024"` (`0.61 mm`) | `9.5` | `0.316"` (`1.25"`–`2.0"`) | `#44` (`0.086"` / `2.18 mm`) | `3/32"` (`0.094"`) | `1.5"`–`2.0"` compound 3D cuts & thick hardwood |

### 5. Zero-Dependency Vector PDF `/ToUnicode` CMap, 2D Scanline Coalescing & 1:1 Print Tiling (`encodePdfToUnicodeCMap`, `mergeBinaryInkScanlines`, `computeTrueScalePrintTiles`)

1. **2D Supersampled Glyph Scanline Coalescing (`mergeBinaryInkScanlines`)**: Merges `4×` supersampled (`0.25 pt`) offscreen `<canvas>` glyph bitmaps horizontally along each scanline and vertically across identical `[x0, x1]` spans into compact `%PDF-1.4` `x y w h re f` vector rectangles—rendering bilingual/CJK titles crisply in minimal Linux `Poppler` (`pdftoppm`) containers with zero installed CJK fonts and `0 kB` `.ttf` bundle overhead.
2. **Searchable `Type0` `/Identity-H` `/ToUnicode` CMap (`encodePdfToUnicodeCMap`)**: Pairs an invisible (`3 Tr`) composite font layer with an `Adobe-Identity-UCS` CMap stream (`<= 100` entries per `beginbfchar` block, 4-hex BMP codes + 8-hex UTF-16BE surrogate pairs for supplementary code points) so `pdftotext` and `PyMuPDF` extract CJK/Unicode strings 100% verbatim.
3. **1:1 Calibrated Sheet Tiling (`computeTrueScalePrintTiles`)**: Partitions physical patterns into margin-safe `72 pt/in` windows on **US Letter** (`7.5" × 9.6"` / `540 × 691.2 pt` inside `612 × 792 pt`) and **ISO A4** (`7.25" × 10.4"` / `184 × 264 mm` / `522 × 748.8 pt` inside `595.28 × 841.89 pt`).

### 6. Half-Pixel `(2W+1)×(2H+1)` Felzenszwalb-Huttenlocher EDT Pinhole Sealing, 4-Connected Marching Squares & `40 px/in` Cut-to-Cut Calibration (`src/contourAndEdt.mjs`)

1. **4-Connected Marching Squares Closed-Loop Tracer (`traceBinaryMaskToContourLoops`, `traceBinaryMaskToSvgPath`)**:
   - Zero-pads the binary mask by `1 px` so perimeter contours close unconditionally, then emits clockwise directed half-edges keeping `1`-pixels on the interior right-hand side `(-dy, dx)`:
     - **Saddle Separation (`case 5` & `case 10`)**: Emits `(left -> bottom, right -> top)` for `case 5` and `(top -> left, bottom -> right)` for `case 10`, matching strict 4-connected BFS topology so diagonal corner pixels never fuse across an empty saw kerf.
     - **Concave Cutout Corners (`case 13` & `case 14`)**: Emits `right -> bottom` (`case 13`) and `bottom -> left` (`case 14`) so enclosed interior cutout loops wind counter-clockwise (`polygonSignedArea2D < 0`) with zero inverted or unclosed chains (`99.2%+` pixel-to-vector IoU).
   - Applies lossless colinear ring coalescing, **antipodal-split closed-loop Ramer-Douglas-Peucker** (splitting each closed ring at its farthest vertex pair before RDP so symmetric circles never collapse onto a 2-point chord), and bounded Chaikin corner smoothing (`maxCutPx = 0.75`).
2. **Half-Pixel `(2W+1)×(2H+1)` Squared Euclidean Distance Transform & Wire-Gauge Pinhole Sealer (`computeHalfPixelEdt`, `resolveInteriorCutoutsAndSealPinholes`)**:
   - Evaluates exact separable 1D parabolic lower-envelope EDT (`O(W \cdot H)`) across pixel centers, edges, and corners simultaneously. Because `1` half-pixel step equals `0.5 px`, $\sqrt{D^2(i_x, i_y)}$ directly yields the **exact maximum inscribed circle diameter in pixels** ($2 r_{\text{px}}$), catching even-width (`2×2 px`) pinholes whose true center lies on a pixel corner rather than a pixel center.
   - Automatically seals micro-pinholes narrower than numbered wire-gauge pilot drill bits (`#65 / 0.89 mm` through `#44 / 2.18 mm`; e.g., sealing `1.03 mm < 1.32 mm #55` serif/script pinholes while preserving `>= 1.50 mm` cutouts), then refines every surviving cutout center via `maxInscribedCircleInContourHole` to guarantee exact `1:1` parity (`survivingHoleLoopCount === drillPoints.length`).
3. **`40 px/in` Rational Cut-to-Cut Outer Dimension Calibration (`calibrateCutToCutPlaqueBounds`, `measureContourOuterBounds`)**:
   - At `40 px/in` (`1 px = 0.025" = 0.635 mm`), full-width `[0 .. gridW]` base rails with `4 px` (`2.54 mm`) splinter-free vertical micro-lands and even-pixel vertical cropping (`2k / 40 = exact 0.05"` rational multiple) produce traced vector contours measuring **`304.80 mm` (`12.0000"`)** cut-to-cut with `0.00 mm` discrepancy.

---

## Production Browser Implementations (100% Client-Side, Zero Login)

### Nonogram Picture Logic Suite (`nonogramgrid.com`)
- **[Nonogram Puzzle](https://nonogramgrid.com/)** — Interactive `5×5` through `20×20` picture logic studio powered by bitmask uniqueness verification and step-by-step logical hints.
- **[Nonogram Generator](https://nonogramgrid.com/nonogram-generator/)** — Photo-to-nonogram converter with 3 detail modes (`Clean Silhouette`, `Sharp Contours`, `Portrait Dither`) and a multi-solution switching-component export guard.
- **[Daily Nonogram Puzzle](https://nonogramgrid.com/daily-nonogram/)** — Seeded deterministic daily grid challenges verified for pure line-by-line human solvability.
- **[Printable Nonogram Puzzles](https://nonogramgrid.com/printable-nonogram-puzzles/)** — `1–30` puzzle progressive `Mix 5->20` vector PDF booklets (US Letter & A4, separate teacher answer keys, and bilingual CJK `/ToUnicode` titles).
- **[Nonogram Solver](https://nonogramgrid.com/nonogram-solver/)** — Mid-game partial-state continuation (`5×5–20×20` + bulk clue paste) and cell-by-cell lookahead contradiction proofs.

### Scroll Saw, Stencil & Pyrography CAD Suite (`scrollsawpatterngenerator.com`)
- **[Scroll Saw Pattern Generator](https://scrollsawpatterngenerator.com/)** — `99.2%` IoU Marching Squares `1:1` calibrated US Letter & A4 tiled vector PDF downloads, Floating-Island Export Guard + Intarsia multi-piece override, and half-pixel EDT wire-gauge (`#65–#44`) pinhole sealing + centered pilot drill marks.
- **[Scroll Saw Name Pattern Maker](https://scrollsawpatterngenerator.com/scroll-saw-name-pattern-maker/)** — `304.80 mm` (`0.00 mm` error) zero-padding flat-bottom welded CJK/Latin script & block name plaques with overhang-free open-top lowercase descender (`g, j, p, q, y`) U-relief coves.
- **[Stencil Maker From Photo](https://scrollsawpatterngenerator.com/stencil-maker-from-photo/)** — Multi-island Mylar, airbrush, and Cricut stencil bridge synthesizer guaranteeing single-sheet physical connectivity.
- **[Wood Burning Pattern Generator](https://scrollsawpatterngenerator.com/wood-burning-pattern-generator/)** — Edge-preserving line art, 3-tone pyrography heat-shading maps, and horizontal mirror iron-on transfer sheets.
- **[Scroll Saw Blade Chart](https://scrollsawpatterngenerator.com/scroll-saw-blade-chart/)** — Interactive thickness, wood hardness, SPM speed, and `#65–#44` numbered wire-gauge pilot drill calculator.

---

## Quick Usage & Verification

```bash
git clone https://github.com/kaiyilu/grid-and-fretwork-math.git
cd grid-and-fretwork-math
npm test
npm run demo
```

```js
import {
  computeNonogramClues,
  deduceNonogramLine,
  solveNonogramBitmask,
  proveNonogramLookaheadStep,
  detectFloatingIslands,
  autoBridgeIslands,
  recommendScrollSawBlade,
  encodePdfToUnicodeCMap,
  mergeBinaryInkScanlines,
  computeTrueScalePrintTiles,
  traceBinaryMaskToContourLoops,
  resolveInteriorCutoutsAndSealPinholes,
  calibrateCutToCutPlaqueBounds,
  measureContourOuterBounds,
} from "./src/index.mjs";

// 1. Mid-game Nonogram continuation & lookahead Reductio ad Absurdum proof
const proof = proveNonogramLookaheadStep(
  [[2], [2], [2], [1]],
  [[1, 1], [2], [2], [1]]
);
// proof.targetCell => { row: 0, col: 0, label: "R1C1", assumedState: -1, provenState: 1 }

// 2. Bilingual /ToUnicode CMap + 4x supersampled glyph scanline merging + 1:1 tiling
const cmap = encodePdfToUnicodeCMap("数织复测 Portrait 20");
const tiles = computeTrueScalePrintTiles(14, 18, "letter"); // 2x2 = 4 US Letter sheets

// 3. Half-pixel (2W+1)x(2H+1) EDT pinhole sealing (#55 / 1.32 mm) + Marching Squares 1:1 contour
const cutoutAudit = resolveInteriorCutoutsAndSealPinholes(plaqueMask, 480, 160, {
  pxPerMm: 40 / 25.4,
  minDrillMm: 1.32,
});
// cutoutAudit.oneToOneParity === true (survivingHoleLoopCount === drillPoints.length)

// 4. 2D 4-connected BFS stencil island audit & shortest-Euclidean bridging
const audit = detectFloatingIslands(stencilMask, 64, 64);
if (audit.islandCount > 0) {
  const { bridgedMask, bridgesAdded } = autoBridgeIslands(stencilMask, 64, 64, 1);
}

// 5. 3-tooth scroll saw blade & numbered wire-gauge pilot drill recommendation
const setup = recommendScrollSawBlade({
  thicknessIn: 0.25,
  isHardwood: false,
  tightFretwork: true,
});
// { bladeSize: "#1", tpi: 20, engagedTeeth: 5, pilotDrillGauge: "#60", pilotDrillIn: 0.04 }
```

### Unit Test Suite Output (`node --test`)

```text
✔ computeNonogramClues extracts exact row and column run-length clues including [0] empty lines
✔ deduceNonogramLine computes bitmask overlap intersections, constrained cells, and contradictions
✔ solveNonogramBitmask proves line-solvability and uniqueness on a 10x10 picture grid
✔ solveNonogramBitmask distinguishes ambiguous multi-solution grids from unsolvable clues
✔ detectFloatingIslands flags interior unanchored islands and rejects diagonal-only corners
✔ autoBridgeIslands welds nested concentric stencil rings into a single 4-connected component
✔ recommendScrollSawBlade enforces TPI >= 3 / thicknessIn and maps numbered wire-gauge pilot drills
✔ mid-game partialGrid continuation deduces forced crosses and fills without restarting from blank
✔ proveNonogramLookaheadStep emits numbered cell-by-cell subSteps and exact contradiction line
✔ encodePdfToUnicodeCMap & mergeBinaryInkScanlines build UTF-16BE CMap streams and coalesce 2D glyph runs
✔ computeTrueScalePrintTiles calculates 1:1 US Letter and ISO A4 poster sheets at 72 pt/in
✔ resolveInteriorCutoutsAndSealPinholes seals 1.03 mm < 1.32 mm #55 micro-pinholes and preserves >= 1.50 mm holes with 1:1 parity
✔ traceBinaryMaskToContourLoops enforces 4-connected saddle separation (cases 5/10/13/14) and >= 99% pixel-to-vector IoU
✔ calibrateCutToCutPlaqueBounds achieves exact 304.80 mm (12.0000 in) cut-to-cut outer dimension parity at 40 px/in
ℹ tests 14 | pass 14 | fail 0
```

## Further Reading

- [Zero-Dependency Bilingual Vector PDFs (/ToUnicode + 4x Scanlines) & Nonogram Contradiction Proofs in TypeScript](https://dev.to/kaiyilu/zero-dependency-bilingual-vector-pdfs-tounicode-4x-scanlines-nonogram-contradiction-proofs-19e5) — Hybrid `4×` scanline + `3 Tr` `/ToUnicode` PDF architecture, `1:1` US Letter / A4 poster tiling, mid-game partial board continuation, and cell-by-cell `Reductio ad Absurdum` proofs.
- [Bitmask Nonogram Line Solvers & 2D BFS Stencil Island Bridging in Pure TypeScript](https://dev.to/kaiyilu/bitmask-nonogram-line-solvers-2d-bfs-stencil-island-bridging-in-pure-typescript-194d) — Deep dive into 31-bit DP line propagation, $2 \times 2$ switching-component elimination, and multi-hop distance-transform stencil bridging.

## License

Released under the [MIT License](./LICENSE).
