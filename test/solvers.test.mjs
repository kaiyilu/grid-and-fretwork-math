import test from "node:test";
import assert from "node:assert/strict";
import {
  computeLineClues,
  computeNonogramClues,
  deduceNonogramLine,
  solveNonogramBitmask,
  proveNonogramLookaheadStep,
  detectFloatingIslands,
  autoBridgeIslands,
  recommendScrollSawBlade,
  SCROLL_SAW_BLADE_TABLE,
  encodePdfToUnicodeCMap,
  mergeBinaryInkScanlines,
  computeTrueScalePrintTiles,
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

test("mid-game partialGrid continuation deduces forced crosses and fills without restarting from blank", () => {
  // 5x5 permutation grid where every row & column clue is [1]: blank board deduces 0 cells
  const onesClues = [[1], [1], [1], [1], [1]];
  const blank = solveNonogramBitmask(onesClues, onesClues);
  assert.equal(blank.unresolvedAfterLinePass, 25);
  assert.equal(blank.lineDeductionSteps, 0);

  // Marking R1C1 = ■ (1) immediately forces × (-1) across R1C2..R1C5 and R2C1..R5C1
  const partialWithFill = [
    [1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ];
  const afterR1C1 = solveNonogramBitmask(onesClues, onesClues, {
    partialGrid: partialWithFill,
  });
  assert.equal(afterR1C1.unresolvedAfterLinePass, 16);
  assert.deepEqual(afterR1C1.lineSolvedGrid[0], [1, -1, -1, -1, -1]);
  for (let r = 1; r < 5; r++) {
    assert.equal(afterR1C1.lineSolvedGrid[r][0], -1);
  }

  // Marking R1C2 = × (-1) on a 5x5 row with clue [3] makes R1C1 unreachable (forced ×) and forces R1C3..R1C5 = ■
  const rowClues = [[3], [1], [1], [1], [1]];
  const colClues = [[1], [1], [1], [2], [2]];
  const partialWithCross = [
    [0, -1, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ];
  const cont = proveNonogramLookaheadStep(rowClues, colClues, partialWithCross);
  assert.equal(cont.lineSolvedGrid[0][0], -1); // R1C1 forced × because [3] cannot fit left of R1C2=×
  assert.deepEqual(cont.lineSolvedGrid[0], [-1, -1, 1, 1, 1]);
});

test("proveNonogramLookaheadStep emits numbered cell-by-cell subSteps and exact contradiction line", () => {
  // Uniquely solvable 4x4 Nonogram where every single row and column has 0 initial 1D overlap!
  const rowClues = [[2], [2], [2], [1]];
  const colClues = [[1, 1], [2], [2], [1]];

  const checkUnique = solveNonogramBitmask(rowClues, colClues);
  assert.equal(checkUnique.solvable, true);
  assert.equal(checkUnique.unique, true);
  assert.equal(checkUnique.lineSolvable, false);
  assert.equal(checkUnique.unresolvedAfterLinePass, 16);

  const proof = proveNonogramLookaheadStep(rowClues, colClues);
  assert.equal(proof.found, true);
  assert.ok(proof.targetCell !== null);
  assert.ok(proof.subSteps.length >= 2);

  // Verify sequential 1..N step numbering and validConfigurations === 0 on the final contradiction step
  proof.subSteps.forEach((step, idx) => {
    assert.equal(step.stepNumber, idx + 1);
    assert.ok(step.axis === "row" || step.axis === "col");
  });

  const finalStep = proof.subSteps[proof.subSteps.length - 1];
  assert.equal(finalStep.contradiction, true);
  assert.equal(finalStep.validConfigurations, 0);
  assert.equal(proof.contradictionLine.validConfigurations, 0);
  assert.equal(finalStep.axis, proof.contradictionLine.axis);
  assert.equal(finalStep.lineIndex, proof.contradictionLine.lineIndex);

  // Proven state at targetCell matches the unique global solution and cascades to solve all 16 cells
  const expectedBool = checkUnique.solution[proof.targetCell.row][proof.targetCell.col];
  assert.equal(proof.targetCell.provenState, expectedBool ? 1 : -1);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      assert.equal(proof.deducedGrid[r][c], checkUnique.solution[r][c] ? 1 : -1);
    }
  }
});

test("encodePdfToUnicodeCMap & mergeBinaryInkScanlines build UTF-16BE CMap streams and coalesce 2D glyph runs", () => {
  // Bilingual + astral emoji title ("数织 🧩 A")
  const cmap = encodePdfToUnicodeCMap("数织 🧩 A");
  assert.equal(cmap.entries.length, 5); // '数', '织', ' ', '🧩', 'A'
  assert.match(cmap.cmapStream, /begincodespacerange\n<0000> <FFFF>\nendcodespacerange/);
  assert.match(cmap.cmapStream, /<0001> <6570>/); // '数' U+6570
  assert.match(cmap.cmapStream, /<0002> <7EC7>/); // '织' U+7EC7
  assert.match(cmap.cmapStream, /<0004> <D83EDDE9>/); // '🧩' U+1F9E9 UTF-16BE surrogate pair
  assert.equal(cmap.encodeStringToCidHex("数织"), "00010002");

  // 8x6 supersampled glyph bitmap (scale = 4 => 2.0pt x 1.5pt):
  // Top 2 rows: full bar x=0..8 (16 px -> merges into 1 rect of 2.0 x 0.5 pt)
  // Bottom 4 rows: vertical stem x=2..6 (16 px -> merges into 1 rect of 1.0 x 1.0 pt)
  const ink = [
    1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1,
    0, 0, 1, 1, 1, 1, 0, 0,
    0, 0, 1, 1, 1, 1, 0, 0,
    0, 0, 1, 1, 1, 1, 0, 0,
    0, 0, 1, 1, 1, 1, 0, 0,
  ];
  const merged = mergeBinaryInkScanlines(ink, 8, 6, 4);
  assert.equal(merged.rawInkPixelCount, 32);
  assert.equal(merged.horizontalRunCount, 6);
  assert.equal(merged.mergedRectCount, 2);
  assert.deepEqual(
    merged.rects.map(({ x, yTop, yPdf, w, h }) => ({ x, yTop, yPdf, w, h })),
    [
      { x: 0, yTop: 0, yPdf: 1, w: 2, h: 0.5 },
      { x: 0.5, yTop: 0.5, yPdf: 0, w: 1, h: 1 },
    ]
  );
  assert.equal(merged.pdfPathOps, "0 1 2 0.5 re 0.5 0 1 1 re f");
});

test("computeTrueScalePrintTiles calculates 1:1 US Letter and ISO A4 poster sheets at 72 pt/in", () => {
  // 14" x 18" scroll-saw plaque on US Letter (7.5" x 9.6" safe window => 2 cols x 2 rows = 4 sheets)
  const letter = computeTrueScalePrintTiles(14, 18, "letter");
  assert.equal(letter.sheetWidthPt, 612);
  assert.equal(letter.sheetHeightPt, 792);
  assert.equal(letter.safeWidthIn, 7.5);
  assert.equal(letter.safeHeightIn, 9.6);
  assert.equal(letter.safeWidthPt, 540);
  assert.equal(letter.safeHeightPt, 691.2);
  assert.equal(letter.cols, 2);
  assert.equal(letter.rows, 2);
  assert.equal(letter.totalSheets, 4);
  assert.equal(letter.tiles[0].gridLabel, "R1C1");
  assert.equal(letter.tiles[0].sourceBoundsPt.width, 540);
  assert.equal(letter.tiles[3].gridLabel, "R2C2");
  assert.equal(letter.tiles[3].sourceBoundsIn.width, 6.5);
  assert.equal(letter.tiles[3].sourceBoundsIn.height, 8.4);

  // 14" x 22" pattern on ISO A4 (7.25" x 10.4" / 184x264mm safe window => 2 cols x 3 rows = 6 sheets)
  const a4 = computeTrueScalePrintTiles(14, 22, "a4");
  assert.equal(a4.sheetWidthPt, 595.28);
  assert.equal(a4.sheetHeightPt, 841.89);
  assert.equal(a4.safeWidthIn, 7.25);
  assert.equal(a4.safeHeightIn, 10.4);
  assert.equal(a4.safeWidthMm, 184);
  assert.equal(a4.safeHeightMm, 264);
  assert.equal(a4.cols, 2);
  assert.equal(a4.rows, 3);
  assert.equal(a4.totalSheets, 6);
});
