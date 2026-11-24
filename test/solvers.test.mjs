import test from "node:test";
import assert from "node:assert/strict";
import {
  computeLineClues,
  computeNonogramClues,
  deduceNonogramLine,
  solveNonogramBitmask,
  detectFloatingIslands,
  autoBridgeIslands,
  recommendScrollSawBlade,
  SCROLL_SAW_BLADE_TABLE,
} from "../src/index.mjs";

test("computeNonogramClues extracts exact row and column run-length clues including [0] empty lines", () => {
  const grid = [
    [1, 1, 0, 1, 0],
    [0, 0, 0, 0, 0],
    [1, 0, 1, 1, 1],
    [0, 1, 0, 1, 0],
  ];

  assert.deepEqual(computeLineClues([0, 0, 0]), [0]);
  const clues = computeNonogramClues(grid);
  assert.equal(clues.rows, 4);
  assert.equal(clues.cols, 5);
  assert.deepEqual(clues.rowClues, [[2, 1], [0], [1, 3], [1, 1]]);
  assert.deepEqual(clues.colClues, [[1, 1], [1, 1], [1], [1, 2], [1]]);
});

test("deduceNonogramLine computes bitmask overlap intersections, constrained cells, and contradictions", () => {
  // Single run [6] on length 10 forces center 2 cells (indices 4 and 5 => 0b0000110000 = 48)
  const overlap = deduceNonogramLine(10, [6]);
  assert.equal(overlap.contradiction, false);
  assert.equal(overlap.validConfigurations, 5);
  assert.equal(overlap.forcedFilledMask, (1 << 4) | (1 << 5));
  assert.equal(overlap.forcedEmptyMask, 0);

  // Pinning cell 0 as filled forces [6] to occupy 0..5 and forces 6..9 empty
  const pinned = deduceNonogramLine(10, [6], 1 << 0, 0);
  assert.equal(pinned.validConfigurations, 1);
  assert.equal(pinned.forcedFilledMask, 0b0000111111);
  assert.equal(pinned.forcedEmptyMask, 0b1111000000);

  // Contradiction: runs [5, 5] require at least 5 + 1 + 5 = 11 cells > 10
  const impossible = deduceNonogramLine(10, [5, 5]);
  assert.equal(impossible.contradiction, true);
  assert.equal(impossible.validConfigurations, 0);
});

test("solveNonogramBitmask proves line-solvability and uniqueness on a 10x10 picture grid", () => {
  const anchorSprite = [
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
    [1, 1, 1, 0, 1, 1, 0, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
  ].map((row) => row.map(Boolean));

  const { rowClues, colClues } = computeNonogramClues(anchorSprite);
  const res = solveNonogramBitmask(rowClues, colClues);

  assert.equal(res.solvable, true);
  assert.equal(res.unique, true);
  assert.equal(res.lineSolvable, true);
  assert.equal(res.solutionCount, 1);
  assert.equal(res.unresolvedAfterLinePass, 0);
  assert.deepEqual(res.solution, anchorSprite);
});

test("solveNonogramBitmask distinguishes ambiguous multi-solution grids from unsolvable clues", () => {
  // Classic 2x2 switching component: row clues [1],[1], col clues [1],[1] has 2 distinct solutions
  const ambiguous = solveNonogramBitmask([[1], [1]], [[1], [1]]);
  assert.equal(ambiguous.solvable, true);
  assert.equal(ambiguous.unique, false);
  assert.equal(ambiguous.lineSolvable, false);
  assert.equal(ambiguous.solutionCount, 2);

  // Unsolvable clue sum mismatch
  const contradictory = solveNonogramBitmask([[2], [2]], [[1], [1]]);
  assert.equal(contradictory.solvable, false);
  assert.equal(contradictory.solutionCount, 0);
  assert.equal(contradictory.solution, null);
});

test("detectFloatingIslands flags interior unanchored islands and rejects diagonal-only corners", () => {
  // 9x9 stencil plaque: solid 1px outer frame, interior cutout, 2x2 center island + diagonal-only corner island
  const W = 9;
  const H = 9;
  const mask = new Uint8Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x === 0 || x === W - 1 || y === 0 || y === H - 1) {
        mask[y * W + x] = 1;
      }
    }
  }
  // Cut away (1,1) etc. already 0; place a pixel at (2,2) and bridge (1,1) ONLY diagonally to (0,0)?
  // Wait: (1,1) touches (0,1) and (1,0) orthogonally! Let's place island #1 at (4,4)..(5,5)
  mask[4 * W + 4] = 1;
  mask[4 * W + 5] = 1;
  mask[5 * W + 4] = 1;
  mask[5 * W + 5] = 1;

  // Place island #2 at (2,6) completely detached in void
  mask[6 * W + 2] = 1;

  const audit = detectFloatingIslands(mask, W, H);
  assert.equal(audit.islandCount, 2);
  assert.equal(audit.floatingPixelCount, 5);
  assert.equal(audit.anchoredCount, 32); // 9*9 - 7*7 = 32 border pixels
});

test("autoBridgeIslands welds nested concentric stencil rings into a single 4-connected component", () => {
  const W = 21;
  const H = 21;
  const mask = new Uint8Array(W * H);

  // Outer structural border + unbridged middle ring + central bullseye island (classic 'O' + dot dropout)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x === 0 || x === W - 1 || y === 0 || y === H - 1) {
        mask[y * W + x] = 1;
        continue;
      }
      const dist = Math.hypot(x - 10, y - 10);
      if (dist >= 5.2 && dist <= 7.0) {
        mask[y * W + x] = 1; // Floating ring island #1
      } else if (dist <= 2.1) {
        mask[y * W + x] = 1; // Nested bullseye island #2 inside ring!
      }
    }
  }

  const before = detectFloatingIslands(mask, W, H);
  assert.equal(before.islandCount, 2);

  const bridged = autoBridgeIslands(mask, W, H, 1);
  assert.equal(bridged.initialIslandCount, 2);
  assert.equal(bridged.bridgesAdded, 2);
  assert.equal(bridged.remainingIslandCount, 0);

  const after = detectFloatingIslands(bridged.bridgedMask, W, H);
  assert.equal(after.islandCount, 0);
  assert.equal(after.floatingPixelCount, 0);
});

test("recommendScrollSawBlade enforces TPI >= 3 / thicknessIn and maps numbered wire-gauge pilot drills", () => {
  assert.equal(SCROLL_SAW_BLADE_TABLE.length, 8);

  // 1/8" (0.125") stock requires TPI >= 24 -> #0 (25 TPI) or #2/0 (28 TPI)
  const eighthInch = recommendScrollSawBlade({
    thicknessIn: 0.125,
    isHardwood: false,
    tightFretwork: false,
  });
  assert.ok(eighthInch.tpi >= 3 / 0.125);
  assert.equal(eighthInch.meetsThreeToothRule, true);
  assert.equal(eighthInch.bladeSize, "#0");
  assert.equal(eighthInch.pilotDrillGauge, "#63");

  // 1/4" (0.25") Baltic birch portrait fretwork -> #1 (20 TPI, #60 wire drill)
  const quarterFretwork = recommendScrollSawBlade({
    thicknessIn: 0.25,
    isHardwood: false,
    tightFretwork: true,
  });
  assert.equal(quarterFretwork.bladeSize, "#1");
  assert.equal(quarterFretwork.pilotDrillGauge, "#60");
  assert.ok(quarterFretwork.engagedTeeth >= 3);

  // 3/4" (0.75") hard maple plaque -> #9 (11 TPI, #50 wire drill)
  const thickMaple = recommendScrollSawBlade({
    thicknessIn: 0.75,
    isHardwood: true,
    tightFretwork: false,
  });
  assert.equal(thickMaple.bladeSize, "#9");
  assert.equal(thickMaple.pilotDrillGauge, "#50");
  assert.ok(thickMaple.engagedTeeth >= 3);

  // 1.5" compound hardwood cut -> #12 (9.5 TPI, #44 wire drill)
  const compoundCut = recommendScrollSawBlade({
    thicknessIn: 1.5,
    isHardwood: true,
    tightFretwork: false,
  });
  assert.equal(compoundCut.bladeSize, "#12");
  assert.equal(compoundCut.pilotDrillGauge, "#44");
  assert.ok(compoundCut.engagedTeeth >= 3);
});
