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
  polygonSignedArea2D,
  pointInPolygon2D,
  traceBinaryMaskToContourLoops,
  computeHalfPixelEdt,
  maxInscribedCircleInContourHole,
  resolveInteriorCutoutsAndSealPinholes,
  measureContourOuterBounds,
  calibrateCutToCutPlaqueBounds,
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

test("resolveInteriorCutoutsAndSealPinholes seals 1.03 mm < 1.32 mm #55 micro-pinholes and preserves >= 1.50 mm holes with 1:1 parity", () => {
  // 12" pattern at 520 px grid width => pxPerMm = 520 / 304.8 = 1.706037 px/mm
  const W = 64;
  const H = 48;
  const pxPerMm = 520 / 304.8;
  const mask = new Uint8Array(W * H).fill(1);

  // 1) Open exterior waste along top/left border (must NOT be sealed or given an interior pilot drill mark)
  for (let x = 0; x < W; x++) mask[x] = 0;

  // 2) Un-drillable 2x2 micro-pinhole at (12..13, 14..15):
  //    Half-pixel EDT sqDist = 4 => rawDiameter = 2.0 px = 1.17 mm => effectiveDiameter = 1.03 mm (< 1.32 mm #55 bit!)
  for (let y = 14; y <= 15; y++) {
    for (let x = 12; x <= 13; x++) {
      mask[y * W + x] = 0;
    }
  }

  // 3) Valid 3x3 enclosed cutout at (28..30, 14..16):
  //    Half-pixel EDT sqDist = 9 => rawDiameter = 3.0 px = 1.76 mm => effectiveDiameter = 1.62 mm (>= 1.50 mm!)
  for (let y = 14; y <= 16; y++) {
    for (let x = 28; x <= 30; x++) {
      mask[y * W + x] = 0;
    }
  }

  // 4) Larger 5x5 enclosed fretwork window at (44..48, 22..26):
  //    Clear diameter ~ 2.75 mm (>= 1.50 mm!)
  for (let y = 22; y <= 26; y++) {
    for (let x = 44; x <= 48; x++) {
      mask[y * W + x] = 0;
    }
  }

  const edtBefore = computeHalfPixelEdt(mask, W, H);
  assert.equal(edtBefore.latticeWidth, W * 2 + 1);
  assert.equal(edtBefore.latticeHeight, H * 2 + 1);

  const res = resolveInteriorCutoutsAndSealPinholes(mask, W, H, {
    pxPerMm,
    minDrillMm: 1.32, // #55 wire-gauge bit
    clearanceMarginMm: 0.18, // 1.32 + 0.18 = 1.50 mm clear threshold
  });

  // Verify the 1.03 mm micro-pinhole was automatically sealed to solid wood
  assert.equal(res.sealedPinholeCount, 1);
  assert.equal(res.sealedPinholes[0].effectiveDiameterMm, 1.03);
  assert.ok(res.sealedPinholes[0].effectiveDiameterMm < 1.32);
  assert.equal(res.sealedWoodMask[14 * W + 12], 1);
  assert.equal(res.sealedWoodMask[15 * W + 13], 1);

  // Exterior open waste stays open (0)
  assert.equal(res.sealedWoodMask[5], 0);

  // Both >= 1.50 mm interior holes survive and receive dead-center pilot drill marks (1:1 parity)
  assert.equal(res.drillPoints.length, 2);
  assert.equal(res.survivingHoleLoopCount, 2);
  assert.equal(res.oneToOneParity, true);
  for (const pt of res.drillPoints) {
    assert.ok(pt.diameterMm >= 1.4, `Expected surviving hole diameter >= 1.4 mm, got ${pt.diameterMm}`);
  }
});

test("traceBinaryMaskToContourLoops enforces 4-connected saddle separation (cases 5/10/13/14) and >= 99% pixel-to-vector IoU", () => {
  // Part A: Explicit 4-connected saddle test (case 10 tl=1,br=1 and case 5 tr=1,bl=1)
  const sW = 14;
  const sH = 14;
  const saddleMask = new Uint8Array(sW * sH);
  // Two 3x3 blocks touching ONLY diagonally at (4,4) and (5,5) -> case 10 saddle
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) saddleMask[y * sW + x] = 1;
  for (let y = 5; y <= 7; y++) for (let x = 5; x <= 7; x++) saddleMask[y * sW + x] = 1;
  // Third 3x3 block touching diagonally at (8,4)..(10,2) -> case 5 saddle across (7,4)/(8,5)
  for (let y = 2; y <= 4; y++) for (let x = 8; x <= 10; x++) saddleMask[y * sW + x] = 1;

  const saddleLoops = traceBinaryMaskToContourLoops(saddleMask, sW, sH, 0, 0);
  // 4-connected topology MUST keep all 3 diagonal-only blocks separate (3 positive-area outer rings, 0 holes)
  assert.equal(saddleLoops.length, 3);
  for (const loop of saddleLoops) {
    assert.ok(polygonSignedArea2D(loop) > 0);
  }

  // Part B: 120x120 fretwork medallion with 4 interior cutouts -> verify >= 99% pixel-to-vector IoU & area parity
  const W = 120;
  const H = 120;
  const medallion = new Uint8Array(W * H);
  let solidCount = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - 60;
      const dy = y + 0.5 - 60;
      const r = Math.hypot(dx, dy);
      let isWood = r <= 52;
      // Carve 4 interior circular cutouts (exercises cases 13 right->bottom and 14 bottom->left)
      const centers = [
        [-22, 0],
        [22, 0],
        [0, -22],
        [0, 22],
      ];
      for (const [cx, cy] of centers) {
        if (Math.hypot(dx - cx, dy - cy) <= 10.5) isWood = false;
      }
      if (isWood) {
        medallion[y * W + x] = 1;
        solidCount++;
      }
    }
  }

  const loops = traceBinaryMaskToContourLoops(medallion, W, H, 0.25, 1);
  const outerLoops = loops.filter((l) => polygonSignedArea2D(l) > 0);
  const holeLoops = loops.filter((l) => polygonSignedArea2D(l) < 0);
  assert.equal(outerLoops.length, 1);
  assert.equal(holeLoops.length, 4);

  const netPolyArea = loops.reduce((acc, l) => acc + polygonSignedArea2D(l), 0);
  const areaParity = netPolyArea / solidCount;
  assert.ok(
    areaParity >= 0.99 && areaParity <= 1.01,
    `Expected >= 99% area parity, got ${(areaParity * 100).toFixed(2)}%`
  );

  // Even-odd vector rasterization IoU over all 14,400 pixel centers
  let intersection = 0;
  let union = 0;
  for (let y = 0; y < H; y++) {
    const py = y + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x + 0.5;
      let inside = false;
      for (const l of loops) {
        if (pointInPolygon2D(px, py, l)) inside = !inside;
      }
      const truth = medallion[y * W + x] === 1;
      if (inside && truth) intersection++;
      if (inside || truth) union++;
    }
  }
  const iou = intersection / union;
  assert.ok(iou >= 0.99, `Expected >= 99% pixel-to-vector IoU, got ${(iou * 100).toFixed(2)}%`);

  // Verify maxInscribedCircleInContourHole finds centered ~10.5 px radius in each petal hole
  const insc0 = maxInscribedCircleInContourHole(holeLoops[0]);
  assert.ok(insc0.radiusPx >= 9.8 && insc0.radiusPx <= 11.0);
});

test("calibrateCutToCutPlaqueBounds achieves exact 304.80 mm (12.0000 in) cut-to-cut outer dimension parity at 40 px/in", () => {
  const widthInches = 12;
  const pxPerIn = 40;
  const gridW = widthInches * pxPerIn; // 480 px
  const rawGridH = 180;
  const flatBottomY = 156;
  const rawWood = new Uint8Array(gridW * rawGridH);

  // Beveled full-width [0 .. 479] base bar from y=132..155 with 4px vertical toe lands at x=0 and x=479
  for (let y = 132; y < flatBottomY; y++) {
    const bevel = Math.max(0, 152 - y); // reaches 0 at y=152..155 (4px vertical toe land!)
    for (let x = bevel; x < gridW - bevel; x++) {
      rawWood[y * gridW + x] = 1;
    }
  }

  // Welded upper lettering mass spanning y=25..135 (odd raw height 155-25+1 = 131 px -> snaps to even 132 px!)
  for (let y = 25; y <= 135; y++) {
    for (let x = 60; x < 420; x++) {
      rawWood[y * gridW + x] = 1;
    }
  }
  // Simulated lowercase descender stroke protruding below flatBottomY (must be clipped cleanly)
  for (let y = flatBottomY; y < 170; y++) {
    for (let x = 210; x < 230; x++) {
      rawWood[y * gridW + x] = 1;
    }
  }

  const cal = calibrateCutToCutPlaqueBounds(rawWood, gridW, rawGridH, {
    pxPerIn,
    flatBottomY,
    enforceFullWidthBaseToe: true,
    toeLandPx: 4,
  });

  assert.equal(cal.gridW, 480);
  assert.equal(cal.gridH % 2, 0); // Exact even pixel height => rational 0.05" multiple
  assert.equal(cal.widthInches, 12);
  assert.equal(cal.targetWidthMm, 304.8);

  const loops = traceBinaryMaskToContourLoops(cal.croppedMask, cal.gridW, cal.gridH, 0.25, 1);
  const bounds = measureContourOuterBounds(loops, pxPerIn);

  assert.equal(bounds.minX, 0);
  assert.equal(bounds.maxX, 480);
  assert.equal(bounds.widthInches, 12.0);
  assert.equal(bounds.widthMm, 304.8);
  assert.equal(Math.abs(bounds.widthMm - 304.8), 0);
  assert.equal(bounds.heightInches, cal.heightInches);
});
