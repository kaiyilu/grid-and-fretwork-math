/**
 * grid-and-fretwork-math
 * Zero-dependency ES module for:
 *  1. 31-bit Bitmask Nonogram Line Deduction & Uniqueness-Verified Grid Solving
 *  2. 2D 4-Connected BFS Stencil / Fretwork Floating-Island Detection & Euclidean Auto-Bridging
 *  3. 3-Tooth Engagement Scroll Saw Blade & Wire-Gauge Pilot Drill Sizing
 *
 * License: MIT
 * Repository: https://github.com/kaiyilu/grid-and-fretwork-math
 */

/* ============================================================================
 * PART 1: 31-BIT BITMASK NONOGRAM CLUE EXTRACTION, LINE DP & GRID SOLVER
 * ========================================================================== */

/**
 * Safe bitmask of `n` contiguous low-order 1s for 0 <= n <= 31.
 * Avoids 32-bit signed `(1 << 31)` overflow in JavaScript bitwise shifts.
 *
 * @param {number} n
 * @returns {number}
 */
function onesMask(n) {
  if (n <= 0) return 0;
  if (n >= 31) return 0x7fffffff;
  return (1 << n) - 1;
}

/**
 * Extracts run-length Nonogram clues from a single boolean/0-1 line.
 * Empty lines emit `[0]` by standard Nonogram notation.
 *
 * @param {ArrayLike<boolean | number>} line
 * @returns {number[]}
 */
export function computeLineClues(line) {
  const runs = [];
  let run = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i]) {
      run++;
    } else if (run > 0) {
      runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  return runs.length > 0 ? runs : [0];
}

/**
 * Computes both row and column run-length clues for a 2D Nonogram grid.
 *
 * @param {Array<Array<boolean | number>>} grid
 * @returns {{ rows: number, cols: number, rowClues: number[][], colClues: number[][] }}
 */
export function computeNonogramClues(grid) {
  if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) {
    throw new TypeError("grid must be a non-empty 2D array of booleans or 0/1 values.");
  }
  const rows = grid.length;
  const cols = grid[0].length;
  const rowClues = [];
  const colClues = [];

  for (let r = 0; r < rows; r++) {
    if (!Array.isArray(grid[r]) || grid[r].length !== cols) {
      throw new RangeError(`Row ${r} length does not match grid width ${cols}.`);
    }
    rowClues.push(computeLineClues(grid[r]));
  }

  for (let c = 0; c < cols; c++) {
    const col = new Array(rows);
    for (let r = 0; r < rows; r++) {
      col[r] = Boolean(grid[r][c]);
    }
    colClues.push(computeLineClues(col));
  }

  return { rows, cols, rowClues, colClues };
}

/**
 * Deduces forced filled and forced empty cells along a single Nonogram line of
 * length `1 <= length <= 31` using memoized O(k * N^2) bitmask dynamic programming.
 *
 * Cell `i` corresponds to bit `(1 << i)`.
 *
 * @param {number} length - Line length (1..31)
 * @param {number[]} runs - Ordered contiguous block lengths (e.g. `[3, 1]` or `[0]`)
 * @param {number} [knownFilledMask=0] - Bitmask of cells already proven filled
 * @param {number} [knownEmptyMask=0] - Bitmask of cells already proven empty
 */
export function deduceNonogramLine(
  length,
  runs,
  knownFilledMask = 0,
  knownEmptyMask = 0
) {
  if (!Number.isInteger(length) || length < 1 || length > 31) {
    throw new RangeError("Line length must be an integer in [1, 31] for 31-bit bitmask deduction.");
  }

  const fullMask = onesMask(length);
  const mustFill = knownFilledMask & fullMask;
  const mustEmpty = knownEmptyMask & fullMask;

  if ((mustFill & mustEmpty) !== 0) {
    return {
      contradiction: true,
      validConfigurations: 0,
      forcedFilledMask: 0,
      forcedEmptyMask: 0,
      newlyFilledMask: 0,
      newlyEmptyMask: 0,
    };
  }

  const activeRuns = Array.isArray(runs)
    ? runs.filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const k = activeRuns.length;

  if (k === 0) {
    if (mustFill !== 0) {
      return {
        contradiction: true,
        validConfigurations: 0,
        forcedFilledMask: 0,
        forcedEmptyMask: 0,
        newlyFilledMask: 0,
        newlyEmptyMask: 0,
      };
    }
    return {
      contradiction: false,
      validConfigurations: 1,
      forcedFilledMask: 0,
      forcedEmptyMask: fullMask,
      newlyFilledMask: 0,
      newlyEmptyMask: fullMask & ~mustEmpty,
    };
  }

  // Suffix minimum cell requirement: minSpan[i] = runs[i] + 1 + minSpan[i + 1]
  const minSpan = new Int32Array(k);
  minSpan[k - 1] = activeRuns[k - 1];
  for (let i = k - 2; i >= 0; i--) {
    minSpan[i] = activeRuns[i] + 1 + minSpan[i + 1];
  }

  if (minSpan[0] > length) {
    return {
      contradiction: true,
      validConfigurations: 0,
      forcedFilledMask: 0,
      forcedEmptyMask: 0,
      newlyFilledMask: 0,
      newlyEmptyMask: 0,
    };
  }

  const stride = length + 2;
  const memoCount = new Float64Array((k + 1) * stride).fill(-1);
  const memoFill = new Int32Array((k + 1) * stride);
  const memoEmpty = new Int32Array((k + 1) * stride);

  function solveSuffix(runIdx, startPos) {
    const clampedStart = startPos > length ? length : startPos;
    const key = runIdx * stride + clampedStart;
    if (memoCount[key] >= 0) {
      return key;
    }

    if (runIdx === k) {
      const remMask = clampedStart >= length ? 0 : fullMask & ~onesMask(clampedStart);
      if ((remMask & mustFill) !== 0) {
        memoCount[key] = 0;
        memoFill[key] = 0;
        memoEmpty[key] = 0;
      } else {
        memoCount[key] = 1;
        memoFill[key] = 0;
        memoEmpty[key] = remMask;
      }
      return key;
    }

    const runLen = activeRuns[runIdx];
    const maxStart = length - minSpan[runIdx];
    const runBits = onesMask(runLen);

    let totalCount = 0;
    let unionFill = 0;
    let unionEmpty = 0;

    for (let pos = clampedStart; pos <= maxStart; pos++) {
      // If advancing past `pos - 1` leaves a known-filled cell uncovered, stop immediately
      if (pos > clampedStart && (mustFill & (1 << (pos - 1))) !== 0) {
        break;
      }

      const blockMask = runBits << pos;
      if ((blockMask & mustEmpty) === 0) {
        const afterPos = pos + runLen;
        const hasSep = afterPos < length;
        const sepBit = hasSep ? 1 << afterPos : 0;

        if ((sepBit & mustFill) === 0) {
          const nextKey = solveSuffix(runIdx + 1, hasSep ? afterPos + 1 : length);
          const subCount = memoCount[nextKey];
          if (subCount > 0) {
            const leadGapMask =
              pos > clampedStart ? onesMask(pos) & ~onesMask(clampedStart) : 0;
            totalCount += subCount;
            unionFill |= blockMask | memoFill[nextKey];
            unionEmpty |= leadGapMask | sepBit | memoEmpty[nextKey];
          }
        }
      }
    }

    memoCount[key] = totalCount;
    memoFill[key] = unionFill;
    memoEmpty[key] = unionEmpty;
    return key;
  }

  const rootKey = solveSuffix(0, 0);
  const validConfigurations = memoCount[rootKey];

  if (validConfigurations === 0) {
    return {
      contradiction: true,
      validConfigurations: 0,
      forcedFilledMask: 0,
      forcedEmptyMask: 0,
      newlyFilledMask: 0,
      newlyEmptyMask: 0,
    };
  }

  const forcedFilledMask = fullMask ^ memoEmpty[rootKey];
  const forcedEmptyMask = fullMask ^ memoFill[rootKey];

  return {
    contradiction: false,
    validConfigurations,
    forcedFilledMask,
    forcedEmptyMask,
    newlyFilledMask: forcedFilledMask & ~mustFill,
    newlyEmptyMask: forcedEmptyMask & ~mustEmpty,
  };
}

/**
 * Solves a 2D Nonogram via iterative bitmask constraint propagation, then verifies
 * solution uniqueness (up to `maxSolutions`, default 2) via minimum-entropy branching.
 *
 * @param {number[][]} rowClues
 * @param {number[][]} colClues
 * @param {{ maxSolutions?: number }} [options={}]
 */
export function solveNonogramBitmask(rowClues, colClues, options = {}) {
  const rows = rowClues.length;
  const cols = colClues.length;
  const maxSolutions = options.maxSolutions ?? 2;

  if (rows < 1 || rows > 31 || cols < 1 || cols > 31) {
    throw new RangeError("Grid dimensions must be between 1x1 and 31x31.");
  }

  const fullRowMask = onesMask(cols);

  function propagate(rFill, rEmpty, cFill, cEmpty) {
    const rowQueued = new Uint8Array(rows).fill(1);
    const colQueued = new Uint8Array(cols).fill(1);
    const queueAxis = [];
    const queueIdx = [];

    for (let r = 0; r < rows; r++) {
      queueAxis.push(0);
      queueIdx.push(r);
    }
    for (let c = 0; c < cols; c++) {
      queueAxis.push(1);
      queueIdx.push(c);
    }

    let head = 0;
    let lineDeductionSteps = 0;

    while (head < queueAxis.length) {
      const axis = queueAxis[head];
      const idx = queueIdx[head];
      head++;

      if (axis === 0) {
        rowQueued[idx] = 0;
        const res = deduceNonogramLine(cols, rowClues[idx], rFill[idx], rEmpty[idx]);
        if (res.contradiction) {
          return { contradiction: true, unresolvedCount: -1, lineDeductionSteps };
        }
        const deltaFill = res.newlyFilledMask;
        const deltaEmpty = res.newlyEmptyMask;
        if (deltaFill !== 0 || deltaEmpty !== 0) {
          lineDeductionSteps++;
          rFill[idx] |= deltaFill;
          rEmpty[idx] |= deltaEmpty;
          const changed = deltaFill | deltaEmpty;
          const rowBit = 1 << idx;
          for (let c = 0; c < cols; c++) {
            const colBit = 1 << c;
            if ((changed & colBit) !== 0) {
              if ((deltaFill & colBit) !== 0) cFill[c] |= rowBit;
              if ((deltaEmpty & colBit) !== 0) cEmpty[c] |= rowBit;
              if (!colQueued[c]) {
                colQueued[c] = 1;
                queueAxis.push(1);
                queueIdx.push(c);
              }
            }
          }
        }
      } else {
        colQueued[idx] = 0;
        const res = deduceNonogramLine(rows, colClues[idx], cFill[idx], cEmpty[idx]);
        if (res.contradiction) {
          return { contradiction: true, unresolvedCount: -1, lineDeductionSteps };
        }
        const deltaFill = res.newlyFilledMask;
        const deltaEmpty = res.newlyEmptyMask;
        if (deltaFill !== 0 || deltaEmpty !== 0) {
          lineDeductionSteps++;
          cFill[idx] |= deltaFill;
          cEmpty[idx] |= deltaEmpty;
          const changed = deltaFill | deltaEmpty;
          const colBit = 1 << idx;
          for (let r = 0; r < rows; r++) {
            const rowBit = 1 << r;
            if ((changed & rowBit) !== 0) {
              if ((deltaFill & rowBit) !== 0) rFill[r] |= colBit;
              if ((deltaEmpty & rowBit) !== 0) rEmpty[r] |= colBit;
              if (!rowQueued[r]) {
                rowQueued[r] = 1;
                queueAxis.push(0);
                queueIdx.push(r);
              }
            }
          }
        }
      }
    }

    let unresolvedCount = 0;
    for (let r = 0; r < rows; r++) {
      const known = rFill[r] | rEmpty[r];
      if (known !== fullRowMask) {
        for (let c = 0; c < cols; c++) {
          if ((known & (1 << c)) === 0) unresolvedCount++;
        }
      }
    }

    return { contradiction: false, unresolvedCount, lineDeductionSteps };
  }

  function masksToBooleanGrid(rFill) {
    return Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => (rFill[r] & (1 << c)) !== 0)
    );
  }

  const rootRFill = new Int32Array(rows);
  const rootREmpty = new Int32Array(rows);
  const rootCFill = new Int32Array(cols);
  const rootCEmpty = new Int32Array(cols);

  const initialPass = propagate(rootRFill, rootREmpty, rootCFill, rootCEmpty);
  if (initialPass.contradiction) {
    return {
      solvable: false,
      unique: false,
      lineSolvable: false,
      solutionCount: 0,
      unresolvedAfterLinePass: rows * cols,
      lineDeductionSteps: initialPass.lineDeductionSteps,
      solution: null,
    };
  }

  if (initialPass.unresolvedCount === 0) {
    return {
      solvable: true,
      unique: true,
      lineSolvable: true,
      solutionCount: 1,
      unresolvedAfterLinePass: 0,
      lineDeductionSteps: initialPass.lineDeductionSteps,
      solution: masksToBooleanGrid(rootRFill),
    };
  }

  const solutions = [];

  function search(rFill, rEmpty, cFill, cEmpty) {
    if (solutions.length >= maxSolutions) return;

    // Pick unresolved row with fewest valid configurations (minimum entropy heuristic)
    let pivotR = -1;
    let bestConfigs = Infinity;
    for (let r = 0; r < rows; r++) {
      if ((rFill[r] | rEmpty[r]) !== fullRowMask) {
        const res = deduceNonogramLine(cols, rowClues[r], rFill[r], rEmpty[r]);
        if (res.contradiction) return;
        if (res.validConfigurations < bestConfigs) {
          bestConfigs = res.validConfigurations;
          pivotR = r;
        }
      }
    }

    if (pivotR === -1) {
      solutions.push(masksToBooleanGrid(rFill));
      return;
    }

    const knownMask = rFill[pivotR] | rEmpty[pivotR];
    let pivotC = 0;
    while ((knownMask & (1 << pivotC)) !== 0) pivotC++;

    for (const assumeFilled of [true, false]) {
      if (solutions.length >= maxSolutions) return;
      const nextRFill = new Int32Array(rFill);
      const nextREmpty = new Int32Array(rEmpty);
      const nextCFill = new Int32Array(cFill);
      const nextCEmpty = new Int32Array(cEmpty);

      if (assumeFilled) {
        nextRFill[pivotR] |= 1 << pivotC;
        nextCFill[pivotC] |= 1 << pivotR;
      } else {
        nextREmpty[pivotR] |= 1 << pivotC;
        nextCEmpty[pivotC] |= 1 << pivotR;
      }

      const step = propagate(nextRFill, nextREmpty, nextCFill, nextCEmpty);
      if (!step.contradiction) {
        if (step.unresolvedCount === 0) {
          solutions.push(masksToBooleanGrid(nextRFill));
        } else {
          search(nextRFill, nextREmpty, nextCFill, nextCEmpty);
        }
      }
    }
  }

  search(rootRFill, rootREmpty, rootCFill, rootCEmpty);

  return {
    solvable: solutions.length > 0,
    unique: solutions.length === 1,
    lineSolvable: false,
    solutionCount: solutions.length,
    unresolvedAfterLinePass: initialPass.unresolvedCount,
    lineDeductionSteps: initialPass.lineDeductionSteps,
    solution: solutions[0] ?? null,
  };
}

/* ============================================================================
 * PART 2: 2D 4-CONNECTED BFS DROPOUT AUDIT & EUCLIDEAN ISLAND AUTO-BRIDGING
 * ========================================================================== */

/**
 * Audits a binary stencil / scroll-saw keep mask (`1` = solid wood/vinyl to keep,
 * `0` = cut-out kerf/void) using 4-connected Breadth-First Search seeded from the
 * outer border.
 *
 * Diagonal-only pixel touches `(x+1, y+1)` have zero cross-sectional width on a
 * scroll saw or vinyl plotter and are intentionally NOT treated as structural
 * connections.
 *
 * `stateMask` encoding:
 *   - `0` = Cut void / waste
 *   - `1` = Structurally anchored keep material (connected to outer frame)
 *   - `2` = Unanchored floating dropout island (will fall out when cut)
 *
 * @param {ArrayLike<number | boolean>} keepMask
 * @param {number} width
 * @param {number} height
 */
export function detectFloatingIslands(keepMask, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("width and height must be positive integers.");
  }
  const total = width * height;
  if (!keepMask || keepMask.length !== total) {
    throw new RangeError(`keepMask length (${keepMask?.length}) must equal width * height (${total}).`);
  }

  const solid = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    solid[i] = keepMask[i] ? 1 : 0;
  }

  // 0 = void, 1 = anchored, 2 = floating island
  const stateMask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  // Seed BFS from all perimeter solid cells (top, bottom, left, right borders)
  for (let x = 0; x < width; x++) {
    const topIdx = x;
    if (solid[topIdx] && stateMask[topIdx] === 0) {
      stateMask[topIdx] = 1;
      queue[tail++] = topIdx;
    }
    const botIdx = (height - 1) * width + x;
    if (solid[botIdx] && stateMask[botIdx] === 0) {
      stateMask[botIdx] = 1;
      queue[tail++] = botIdx;
    }
  }
  for (let y = 1; y < height - 1; y++) {
    const leftIdx = y * width;
    if (solid[leftIdx] && stateMask[leftIdx] === 0) {
      stateMask[leftIdx] = 1;
      queue[tail++] = leftIdx;
    }
    const rightIdx = y * width + (width - 1);
    if (solid[rightIdx] && stateMask[rightIdx] === 0) {
      stateMask[rightIdx] = 1;
      queue[tail++] = rightIdx;
    }
  }

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % width;
    const cy = (cur - cx) / width;

    if (cx > 0 && solid[cur - 1] && stateMask[cur - 1] === 0) {
      stateMask[cur - 1] = 1;
      queue[tail++] = cur - 1;
    }
    if (cx < width - 1 && solid[cur + 1] && stateMask[cur + 1] === 0) {
      stateMask[cur + 1] = 1;
      queue[tail++] = cur + 1;
    }
    if (cy > 0 && solid[cur - width] && stateMask[cur - width] === 0) {
      stateMask[cur - width] = 1;
      queue[tail++] = cur - width;
    }
    if (cy < height - 1 && solid[cur + width] && stateMask[cur + width] === 0) {
      stateMask[cur + width] = 1;
      queue[tail++] = cur + width;
    }
  }

  const anchoredCount = tail;
  const islands = [];
  let floatingPixelCount = 0;

  for (let i = 0; i < total; i++) {
    if (solid[i] === 1 && stateMask[i] === 0) {
      let cHead = 0;
      let cTail = 0;
      stateMask[i] = 2;
      queue[cTail++] = i;

      let sumX = 0;
      let sumY = 0;
      let minX = width;
      let maxX = 0;
      let minY = height;
      let maxY = 0;
      const boundaryIndices = [];

      while (cHead < cTail) {
        const cur = queue[cHead++];
        const cx = cur % width;
        const cy = (cur - cx) / width;
        sumX += cx;
        sumY += cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        let isBoundary = false;
        if (cx > 0) {
          if (solid[cur - 1] === 0) isBoundary = true;
          else if (stateMask[cur - 1] === 0) {
            stateMask[cur - 1] = 2;
            queue[cTail++] = cur - 1;
          }
        } else {
          isBoundary = true;
        }
        if (cx < width - 1) {
          if (solid[cur + 1] === 0) isBoundary = true;
          else if (stateMask[cur + 1] === 0) {
            stateMask[cur + 1] = 2;
            queue[cTail++] = cur + 1;
          }
        } else {
          isBoundary = true;
        }
        if (cy > 0) {
          if (solid[cur - width] === 0) isBoundary = true;
          else if (stateMask[cur - width] === 0) {
            stateMask[cur - width] = 2;
            queue[cTail++] = cur - width;
          }
        } else {
          isBoundary = true;
        }
        if (cy < height - 1) {
          if (solid[cur + width] === 0) isBoundary = true;
          else if (stateMask[cur + width] === 0) {
            stateMask[cur + width] = 2;
            queue[cTail++] = cur + width;
          }
        } else {
          isBoundary = true;
        }

        if (isBoundary) {
          boundaryIndices.push(cur);
        }
      }

      const pixelCount = cTail;
      floatingPixelCount += pixelCount;
      islands.push({
        id: islands.length + 1,
        pixelCount,
        minX,
        maxX,
        minY,
        maxY,
        centroidX: Number((sumX / pixelCount).toFixed(2)),
        centroidY: Number((sumY / pixelCount).toFixed(2)),
        boundaryIndices,
      });
    }
  }

  return {
    width,
    height,
    anchoredCount,
    floatingPixelCount,
    islandCount: islands.length,
    islands,
    stateMask,
  };
}

/**
 * Stamps a 4-connected circular brush along segment `(x0, y0) -> (x1, y1)`.
 */
function stampStructuralTab(bridgedMask, bridgeOnlyMask, width, height, x0, y0, x1, y1, radiusPx) {
  const r = Math.max(0, radiusPx);
  const ceilR = Math.ceil(r + 0.5);
  const rSq = (r + 0.35) * (r + 0.35);

  const stampDisk = (cx, cy) => {
    const minY = Math.max(0, Math.floor(cy - ceilR));
    const maxY = Math.min(height - 1, Math.ceil(cy + ceilR));
    const minX = Math.max(0, Math.floor(cx - ceilR));
    const maxX = Math.min(width - 1, Math.ceil(cx + ceilR));
    for (let py = minY; py <= maxY; py++) {
      const dy = py - cy;
      for (let px = minX; px <= maxX; px++) {
        const dx = px - cx;
        if (dx * dx + dy * dy <= rSq) {
          const idx = py * width + px;
          if (bridgedMask[idx] === 0) {
            bridgeOnlyMask[idx] = 1;
          }
          bridgedMask[idx] = 1;
        }
      }
    }
  };

  // Supercover 4-connected integer walk + dense disk interpolation
  let ix = x0;
  let iy = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  stampDisk(ix, iy);
  while (ix !== x1 || iy !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy && e2 < dx) {
      // Diagonal transition: step horizontally first so centerline stays strictly 4-connected
      const stepIdx = iy * width + (ix + sx);
      if (bridgedMask[stepIdx] === 0) bridgeOnlyMask[stepIdx] = 1;
      bridgedMask[stepIdx] = 1;
    }
    if (e2 > -dy) {
      err -= dy;
      ix += sx;
    }
    if (e2 < dx) {
      err += dx;
      iy += sy;
    }
    stampDisk(ix, iy);
  }
}

/**
 * Automatically bridges every floating dropout island back to the perimeter-anchored
 * frame by iteratively connecting the globally shortest Euclidean boundary gap
 * `(anchorBoundaryPt <-> islandBoundaryPt)`.
 *
 * Naturally resolves multi-hop concentric/nested islands (e.g., pupil inside eye ring)
 * by promoting newly bridged islands into the anchored set on each pass.
 *
 * @param {ArrayLike<number | boolean>} keepMask
 * @param {number} width
 * @param {number} height
 * @param {number} [bridgeRadiusPx=1] - Half-width brush radius in pixels (e.g. `1` => ~3px tab)
 */
export function autoBridgeIslands(keepMask, width, height, bridgeRadiusPx = 1) {
  const total = width * height;
  const bridgedMask = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    bridgedMask[i] = keepMask[i] ? 1 : 0;
  }
  const bridgeOnlyMask = new Uint8Array(total);

  let audit = detectFloatingIslands(bridgedMask, width, height);
  const initialIslandCount = audit.islandCount;
  const bridges = [];

  if (initialIslandCount === 0 || audit.anchoredCount === 0) {
    return {
      bridgedMask,
      bridgeOnlyMask,
      bridgesAdded: 0,
      bridges,
      initialIslandCount,
      remainingIslandCount: audit.islandCount,
    };
  }

  const maxPasses = initialIslandCount + 2;
  let pass = 0;

  while (audit.islandCount > 0 && pass < maxPasses) {
    pass++;

    // Collect boundary pixels of the currently anchored component (`stateMask === 1`)
    const anchoredBoundary = [];
    const { stateMask } = audit;
    for (let y = 0; y < height; y++) {
      const rowOff = y * width;
      for (let x = 0; x < width; x++) {
        const idx = rowOff + x;
        if (stateMask[idx] !== 1) continue;
        if (
          (x > 0 && bridgedMask[idx - 1] === 0) ||
          (x < width - 1 && bridgedMask[idx + 1] === 0) ||
          (y > 0 && bridgedMask[idx - width] === 0) ||
          (y < height - 1 && bridgedMask[idx + width] === 0)
        ) {
          anchoredBoundary.push(idx);
        }
      }
    }

    if (anchoredBoundary.length === 0) break;

    let bestDistSq = Infinity;
    let bestAnchorIdx = -1;
    let bestIslandIdx = -1;
    let bestIslandId = -1;

    for (const island of audit.islands) {
      const ib = island.boundaryIndices;
      for (let i = 0; i < ib.length; i++) {
        const pIdx = ib[i];
        const px = pIdx % width;
        const py = (pIdx - px) / width;

        for (let j = 0; j < anchoredBoundary.length; j++) {
          const aIdx = anchoredBoundary[j];
          const ax = aIdx % width;
          const ay = (aIdx - ax) / width;
          const dx = px - ax;
          const dy = py - ay;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestAnchorIdx = aIdx;
            bestIslandIdx = pIdx;
            bestIslandId = island.id;
          }
        }
      }
    }

    if (bestAnchorIdx < 0 || bestIslandIdx < 0) break;

    const ax = bestAnchorIdx % width;
    const ay = (bestAnchorIdx - ax) / width;
    const bx = bestIslandIdx % width;
    const by = (bestIslandIdx - bx) / width;

    stampStructuralTab(
      bridgedMask,
      bridgeOnlyMask,
      width,
      height,
      ax,
      ay,
      bx,
      by,
      bridgeRadiusPx
    );

    bridges.push({
      islandId: bestIslandId,
      from: { x: ax, y: ay },
      to: { x: bx, y: by },
      lengthPx: Number(Math.sqrt(bestDistSq).toFixed(2)),
      radiusPx: bridgeRadiusPx,
    });

    audit = detectFloatingIslands(bridgedMask, width, height);
  }

  return {
    bridgedMask,
    bridgeOnlyMask,
    bridgesAdded: bridges.length,
    bridges,
    initialIslandCount,
    remainingIslandCount: audit.islandCount,
  };
}

/* ============================================================================
 * PART 3: 3-TOOTH ENGAGEMENT SCROLL SAW BLADE & WIRE-GAUGE DRILL CALCULATOR
 * ========================================================================== */

/**
 * Standard plain-end 5" fretwork & skip/ultra-reverse scroll saw blade specifications
 * (`#2/0` micro veneer blades through `#12` heavy compound hardwood blades).
 */
export const SCROLL_SAW_BLADE_TABLE = Object.freeze([
  {
    bladeSize: "#2/0",
    widthIn: 0.022,
    widthMm: 0.56,
    kerfThicknessIn: 0.01,
    kerfThicknessMm: 0.25,
    tpi: 28,
    pilotDrillGauge: "#65",
    pilotDrillIn: 0.035,
    pilotDrillMm: 0.89,
    fractionalDrill: '1/32" (0.031") / 3/64"',
  },
  {
    bladeSize: "#0",
    widthIn: 0.024,
    widthMm: 0.61,
    kerfThicknessIn: 0.011,
    kerfThicknessMm: 0.28,
    tpi: 25,
    pilotDrillGauge: "#63",
    pilotDrillIn: 0.037,
    pilotDrillMm: 0.94,
    fractionalDrill: '3/64" (0.047")',
  },
  {
    bladeSize: "#1",
    widthIn: 0.029,
    widthMm: 0.74,
    kerfThicknessIn: 0.012,
    kerfThicknessMm: 0.3,
    tpi: 20,
    pilotDrillGauge: "#60",
    pilotDrillIn: 0.04,
    pilotDrillMm: 1.02,
    fractionalDrill: '3/64" (0.047")',
  },
  {
    bladeSize: "#3",
    widthIn: 0.034,
    widthMm: 0.86,
    kerfThicknessIn: 0.014,
    kerfThicknessMm: 0.36,
    tpi: 16,
    pilotDrillGauge: "#58",
    pilotDrillIn: 0.042,
    pilotDrillMm: 1.07,
    fractionalDrill: '3/64" (0.047")',
  },
  {
    bladeSize: "#5",
    widthIn: 0.041,
    widthMm: 1.04,
    kerfThicknessIn: 0.016,
    kerfThicknessMm: 0.41,
    tpi: 12.5,
    pilotDrillGauge: "#55",
    pilotDrillIn: 0.052,
    pilotDrillMm: 1.32,
    fractionalDrill: '1/16" (0.063")',
  },
  {
    bladeSize: "#7",
    widthIn: 0.045,
    widthMm: 1.14,
    kerfThicknessIn: 0.018,
    kerfThicknessMm: 0.46,
    tpi: 11.5,
    pilotDrillGauge: "#53",
    pilotDrillIn: 0.0595,
    pilotDrillMm: 1.51,
    fractionalDrill: '1/16" (0.063")',
  },
  {
    bladeSize: "#9",
    widthIn: 0.053,
    widthMm: 1.35,
    kerfThicknessIn: 0.019,
    kerfThicknessMm: 0.48,
    tpi: 11,
    pilotDrillGauge: "#50",
    pilotDrillIn: 0.07,
    pilotDrillMm: 1.78,
    fractionalDrill: '5/64" (0.078")',
  },
  {
    bladeSize: "#12",
    widthIn: 0.062,
    widthMm: 1.57,
    kerfThicknessIn: 0.024,
    kerfThicknessMm: 0.61,
    tpi: 9.5,
    pilotDrillGauge: "#44",
    pilotDrillIn: 0.086,
    pilotDrillMm: 2.18,
    fractionalDrill: '3/32" (0.094")',
  },
]);

/**
 * Selects an optimal scroll saw blade (`#2/0`..`#12`) and numbered wire-gauge
 * interior entry pilot drill bit under the 3-tooth minimum engagement law:
 *
 *   TPI >= 3 / thicknessIn
 *
 * Ensures at least 3 teeth span the stock thickness simultaneously to prevent
 * upstroke workpiece chatter while maintaining gullet clearance against scorch.
 *
 * @param {{ thicknessIn: number, isHardwood?: boolean, tightFretwork?: boolean }} params
 */
export function recommendScrollSawBlade({
  thicknessIn,
  isHardwood = false,
  tightFretwork = false,
}) {
  if (!Number.isFinite(thicknessIn) || thicknessIn <= 0) {
    throw new RangeError("thicknessIn must be a positive stock thickness in inches.");
  }

  const minRequiredTpi = Number((3 / thicknessIn).toFixed(2));

  // Base thickness bracket onto SCROLL_SAW_BLADE_TABLE [0..7]
  let idx = 3; // #3 workshop baseline
  if (thicknessIn <= 0.1) idx = 0; // <= 3/32" veneer -> #2/0 (28 TPI)
  else if (thicknessIn <= 0.145) idx = 1; // 1/8" -> #0 (25 TPI >= 24 TPI)
  else if (thicknessIn <= 0.2) idx = 2; // 3/16" -> #1 (20 TPI >= 16 TPI)
  else if (thicknessIn <= 0.32) idx = 3; // 1/4" -> #3 (16 TPI >= 12 TPI)
  else if (thicknessIn <= 0.55) idx = 4; // 3/8" - 1/2" -> #5 (12.5 TPI)
  else if (thicknessIn <= 0.85) idx = 5; // 3/4" -> #7 (11.5 TPI)
  else if (thicknessIn <= 1.3) idx = 6; // 1.0" - 1.25" -> #9 (11 TPI)
  else idx = 7; // >= 1.5" -> #12 (9.5 TPI)

  // Dense hardwood >= 1/2" benefits from stiffer spine & wider gullets
  if (isHardwood && thicknessIn >= 0.5) {
    idx = Math.min(SCROLL_SAW_BLADE_TABLE.length - 1, idx + 1);
  }

  // Tight interior fretwork steps down 1 blade size for tighter corner radius
  if (tightFretwork) {
    idx = Math.max(0, idx - 1);
  }

  // Enforce 3-tooth minimum engagement (`tpi >= 3 / thicknessIn`) whenever achievable
  while (idx > 0 && SCROLL_SAW_BLADE_TABLE[idx].tpi < 3 / thicknessIn) {
    idx--;
  }

  const spec = SCROLL_SAW_BLADE_TABLE[idx];
  const engagedTeeth = Number((thicknessIn * spec.tpi).toFixed(2));

  const toothGeometry = tightFretwork
    ? "Ultra-Reverse Fretwork (Every 3rd Tooth Reversed)"
    : isHardwood && thicknessIn >= 0.75
    ? "Precision-Ground Skip-Tooth / Double-Tooth"
    : isHardwood
    ? "Ultra-Reverse (Zero Underside Tear-Out)"
    : "Reverse Skip-Tooth";

  const spmRange =
    thicknessIn <= 0.18
      ? [900, 1250]
      : isHardwood && thicknessIn >= 0.75
      ? [1350, 1650]
      : [1150, 1450];

  return {
    ...spec,
    thicknessIn,
    isHardwood,
    tightFretwork,
    minRequiredTpi,
    engagedTeeth,
    meetsThreeToothRule: engagedTeeth >= 3,
    stackingRecommended: engagedTeeth < 3,
    toothGeometry,
    spmRange,
  };
}

/* ============================================================================
 * CLI DEMO ENTRYPOINT (`node ./src/index.mjs`) — Browser ES-Module Safe
 * ========================================================================== */

const isDirectCli =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  decodeURIComponent(import.meta.url).endsWith(
    process.argv[1].replace(/\\/g, "/").replace(/^\.\//, "")
  );

if (isDirectCli) {
  const heartGrid = [
    [0, 1, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ];
  const clues = computeNonogramClues(heartGrid);
  const solved = solveNonogramBitmask(clues.rowClues, clues.colClues);
  const blade = recommendScrollSawBlade({
    thicknessIn: 0.25,
    isHardwood: true,
    tightFretwork: true,
  });

  console.log("grid-and-fretwork-math verification summary:");
  console.log("  Nonogram 5x5 Heart ->", {
    unique: solved.unique,
    lineSolvable: solved.lineSolvable,
    steps: solved.lineDeductionSteps,
  });
  console.log("  1/4\" Hardwood Fretwork Blade ->", {
    bladeSize: blade.bladeSize,
    tpi: blade.tpi,
    engagedTeeth: blade.engagedTeeth,
    pilotDrill: `${blade.pilotDrillGauge} (${blade.pilotDrillIn}")`,
  });
}
