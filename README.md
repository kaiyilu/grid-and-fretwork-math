# Grid & Fretwork Math: 31-Bit Bitmask Nonogram Solvers & 2D BFS Stencil Island Bridging

Zero-dependency JavaScript / Node.js discrete grid solvers for **uniqueness-verified Nonogram picture logic puzzles**, **scroll-saw & vinyl stencil floating-island dropout detection**, **shortest-Euclidean structural tab synthesis**, and **3-tooth scroll saw blade & wire-gauge drill sizing**.

- **Interactive Field Guide & Live Verifier**: [https://kaiyilu.github.io/grid-and-fretwork-math/](https://kaiyilu.github.io/grid-and-fretwork-math/)
- **Source Module**: [`./src/index.mjs`](./src/index.mjs) (Pure ES Module, `0` npm dependencies, browser & Node.js 18+)
- **Run Unit Tests**: `node --test` (`7` passing `node:test` suites)
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

### 2. Iterative Queue Propagation & Uniqueness Proof (`solveNonogramBitmask`)

`solveNonogramBitmask(rowClues, colClues)` maintains dirty bitqueues over rows and columns. Whenever row $r$ deduces $\Delta_{\text{fill}}$ or $\Delta_{\text{empty}}$, only affected column indices $c$ with $(\Delta_{\text{fill}} \lor \Delta_{\text{empty}}) \land 2^c \neq 0$ are re-queued.

- If queue exhaustion resolves all $R \times C$ cells (`unresolvedAfterLinePass === 0`), the puzzle is proven **purely human line-solvable** (`lineSolvable: true`, `unique: true`) with zero trial-and-error bifurcation.
- Otherwise, minimum-entropy backtracking branches on the unresolved line with minimum `validConfigurations`, capping search at `maxSolutions = 2` to distinguish uniquely solvable grids (`solutionCount === 1`) from ambiguous switching components (`solutionCount >= 2`).

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

---

## Production Browser Implementations (100% Client-Side, Zero Login)

### Nonogram Picture Logic Suite (`nonogramgrid.com`)
- **[Nonogram Puzzle](https://nonogramgrid.com/)** — Interactive `5×5` through `20×20` picture logic studio powered by bitmask uniqueness verification and step-by-step logical hints.
- **[Nonogram Generator](https://nonogramgrid.com/nonogram-generator/)** — Converts uploaded images or pixel art into guaranteed single-solution Nonograms by automatically repairing ambiguous $2 \times 2$ switching components.
- **[Daily Nonogram Puzzle](https://nonogramgrid.com/daily-nonogram/)** — Seeded deterministic daily grid challenges verified for pure line-by-line human solvability.
- **[Printable Nonogram Puzzles](https://nonogramgrid.com/printable-nonogram-puzzles/)** — Crisp vector PDF puzzle booklets with pre-computed row/column clue headers and answer keys.
- **[Nonogram Solver](https://nonogramgrid.com/nonogram-solver/)** — Interactive bitmask line deduction debugger explaining exact forced overlaps and empty cross-outs step by step.

### Scroll Saw, Stencil & Pyrography CAD Suite (`scrollsawpatterngenerator.com`)
- **[Scroll Saw Pattern Generator](https://scrollsawpatterngenerator.com/)** — Converts photos into cut-ready wood fretwork SVGs with 2D BFS dropout island highlighting, 1-click auto-bridging, and `#58` pilot drill marks.
- **[Scroll Saw Name Pattern Maker](https://scrollsawpatterngenerator.com/scroll-saw-name-pattern-maker/)** — Generates structurally welded script & block lettering plaques where interior counters (`a`, `e`, `o`, `g`) auto-bridge to the base rail.
- **[Stencil Maker From Photo](https://scrollsawpatterngenerator.com/stencil-maker-from-photo/)** — Multi-island Mylar, airbrush, and Cricut stencil bridge synthesizer guaranteeing single-sheet physical connectivity.
- **[Wood Burning Pattern Generator](https://scrollsawpatterngenerator.com/wood-burning-pattern-generator/)** — Edge-preserving line art, 3-tone pyrography heat-shading maps, and horizontal mirror iron-on transfer sheets.
- **[Scroll Saw Blade Chart](https://scrollsawpatterngenerator.com/scroll-saw-blade-chart/)** — Interactive thickness, wood hardness, SPM speed, and numbered wire-gauge pilot drill calculator.

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
  detectFloatingIslands,
  autoBridgeIslands,
  recommendScrollSawBlade,
} from "./src/index.mjs";

// 1. Bitmask Nonogram line deduction & full uniqueness proof
const line = deduceNonogramLine(10, [6]);
// line.forcedFilledMask => 0b0000110000 (cells 4 & 5 forced across all 5 placements)

const clues = computeNonogramClues([
  [0, 1, 0, 1, 0],
  [1, 1, 1, 1, 1],
  [0, 1, 1, 1, 0],
  [0, 0, 1, 0, 0],
]);
const solved = solveNonogramBitmask(clues.rowClues, clues.colClues);
// { solvable: true, unique: true, lineSolvable: true, solutionCount: 1, ... }

// 2. 2D 4-connected BFS stencil island audit & shortest-Euclidean bridging
const audit = detectFloatingIslands(stencilMask, 64, 64);
if (audit.islandCount > 0) {
  const { bridgedMask, bridgesAdded } = autoBridgeIslands(stencilMask, 64, 64, 1);
}

// 3. 3-tooth scroll saw blade & numbered wire-gauge pilot drill recommendation
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
ℹ tests 7 | pass 7 | fail 0
```

## Further Reading

- [Bitmask Nonogram Line Solvers & 2D BFS Stencil Island Bridging in Pure TypeScript](https://dev.to/kaiyilu/bitmask-nonogram-line-solvers-2d-bfs-stencil-island-bridging-in-pure-typescript-194d) — Deep dive into 31-bit DP line propagation, $2 \times 2$ switching-component elimination, and multi-hop distance-transform stencil bridging.

## License

Released under the [MIT License](./LICENSE).
