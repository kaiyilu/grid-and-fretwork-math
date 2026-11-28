/**
 * contourAndEdt.mjs
 * Zero-dependency computational geometry algorithms for scroll-saw fretwork & stencil CAD:
 *  1. Half-Pixel (2W+1)×(2H+1) Felzenszwalb-Huttenlocher Squared Euclidean Distance Transform (O(WH))
 *  2. 4-Connected Marching Squares Closed-Loop Contour Tracer (topological saddle invariant)
 *  3. Smoothed Polygon Pole-of-Inaccessibility & Wire-Gauge (#65–#44) Micro-Pinhole Sealer
 *  4. 40 px/in Rational Cut-to-Cut Outer Bounding-Box Calibration & Descender Relief Cove Geometry
 *
 * License: MIT
 */

/**
 * Perpendicular distance from point `pt` to segment `a -> b`.
 *
 * @param {{ x: number, y: number }} pt
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {number}
 */
export function perpendicularSegmentDistance(pt, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(pt.x - a.x, pt.y - a.y);
  const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq));
  return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
}

function rdpSimplifyOpen(points, epsilon) {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularSegmentDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      index = i;
      maxDist = d;
    }
  }
  if (maxDist > epsilon) {
    const left = rdpSimplifyOpen(points.slice(0, index + 1), epsilon);
    const right = rdpSimplifyOpen(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

function chaikinSmoothClosed(pts, iterations = 1, maxCutPx = 0.75) {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 4) break;
    const next = [];
    for (let i = 0; i < cur.length; i++) {
      const p0 = cur[i];
      const p1 = cur[(i + 1) % cur.length];
      const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (len < 1e-6) continue;
      const t = Math.min(0.25, maxCutPx / len);
      next.push({
        x: (1 - t) * p0.x + t * p1.x,
        y: (1 - t) * p0.y + t * p1.y,
      });
      next.push({
        x: t * p0.x + (1 - t) * p1.x,
        y: t * p0.y + (1 - t) * p1.y,
      });
    }
    cur = next;
  }
  return cur;
}

function coalesceColinearClosedRing(rawRing) {
  if (rawRing.length <= 3) return rawRing;
  let ring = rawRing.filter((pt, idx, arr) => {
    const prev = arr[(idx - 1 + arr.length) % arr.length];
    return Math.hypot(pt.x - prev.x, pt.y - prev.y) > 1e-6;
  });
  let changed = true;
  while (changed && ring.length > 3) {
    changed = false;
    const nextRing = [];
    const m = ring.length;
    for (let i = 0; i < m; i++) {
      const prev =
        nextRing.length > 0 ? nextRing[nextRing.length - 1] : ring[(i - 1 + m) % m];
      const curr = ring[i];
      const next = ring[(i + 1) % m];
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      const remaining = m - i + nextRing.length;
      if (
        remaining > 3 &&
        Math.abs(dx1 * dy2 - dy1 * dx2) <= 1e-6 &&
        dx1 * dx2 + dy1 * dy2 >= 0
      ) {
        changed = true;
        continue;
      }
      nextRing.push(curr);
    }
    ring = nextRing;
  }
  return ring;
}

/**
 * Signed 2D shoelace area of a closed polygon ring.
 * Under SVG top-left coordinates (x right, y down) and clockwise half-edge orientation
 * around 1-pixels:
 *   - Outer solid wood contours have `signedArea > 0`
 *   - Enclosed interior cutout hole contours have `signedArea < 0`
 *
 * @param {Array<{ x: number, y: number }>} pts
 * @returns {number}
 */
export function polygonSignedArea2D(pts) {
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  return area2 * 0.5;
}

/**
 * Even-odd ray-casting point-in-polygon test in 2D.
 *
 * @param {number} px
 * @param {number} py
 * @param {Array<{ x: number, y: number }>} pts
 * @returns {boolean}
 */
export function pointInPolygon2D(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 4-Connected Marching Squares Closed-Loop Contour Tracer.
 *
 * Pads the binary mask by 1 pixel of 0s around the perimeter so all outer boundaries close
 * cleanly, then emits directed clockwise half-edges keeping `1`-pixels strictly on the
 * interior right-hand side (`(-dy, dx)` in top-down screen coordinates):
 *   - `case 5` (`tr=1, bl=1`): `left -> bottom` and `right -> top` (4-connected saddle separation)
 *   - `case 10` (`tl=1, br=1`): `top -> left` and `bottom -> right` (4-connected saddle separation)
 *   - `case 13` (`br=0, tl=tr=bl=1`): `right -> bottom`
 *   - `case 14` (`bl=0, tl=tr=br=1`): `bottom -> left`
 *
 * Followed by lossless colinear coalescing, antipodal-split closed-loop RDP simplification
 * (preventing symmetric closed rings from collapsing onto a single chord), and bounded
 * Chaikin corner smoothing (`maxCutPx = 0.75`).
 *
 * @param {ArrayLike<number | boolean>} mask
 * @param {number} width
 * @param {number} height
 * @param {number | { simplifyEpsilon?: number, smoothPasses?: number, maxCutPx?: number }} [optionsOrEpsilon=0.25]
 * @param {number} [smoothPassesArg=1]
 * @returns {Array<Array<{ x: number, y: number }>>}
 */
export function traceBinaryMaskToContourLoops(
  mask,
  width,
  height,
  optionsOrEpsilon = 0.25,
  smoothPassesArg = 1
) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("width and height must be positive integers.");
  }
  if (!mask || mask.length !== width * height) {
    throw new RangeError(`mask length (${mask?.length}) must equal width * height (${width * height}).`);
  }

  let simplifyEpsilon = 0.25;
  let smoothPasses = 1;
  let maxCutPx = 0.75;

  if (typeof optionsOrEpsilon === "object" && optionsOrEpsilon !== null) {
    simplifyEpsilon = optionsOrEpsilon.simplifyEpsilon ?? 0.25;
    smoothPasses = optionsOrEpsilon.smoothPasses ?? 1;
    maxCutPx = optionsOrEpsilon.maxCutPx ?? 0.75;
  } else {
    simplifyEpsilon = Number(optionsOrEpsilon);
    smoothPasses = Number(smoothPassesArg);
  }

  const pw = width + 2;
  const ph = height + 2;
  const padded = new Uint8Array(pw * ph);
  for (let y = 0; y < height; y++) {
    const srcOff = y * width;
    const dstOff = (y + 1) * pw + 1;
    for (let x = 0; x < width; x++) {
      padded[dstOff + x] = mask[srcOff + x] ? 1 : 0;
    }
  }

  const adj = new Map();
  const addSeg = (x1, y1, x2, y2) => {
    const k1 = `${x1.toFixed(1)},${y1.toFixed(1)}`;
    const k2 = `${x2.toFixed(1)},${y2.toFixed(1)}`;
    const list = adj.get(k1);
    if (list) list.push(k2);
    else adj.set(k1, [k2]);
  };

  for (let y = 0; y < ph - 1; y++) {
    for (let x = 0; x < pw - 1; x++) {
      const tl = padded[y * pw + x];
      const tr = padded[y * pw + (x + 1)];
      const br = padded[(y + 1) * pw + (x + 1)];
      const bl = padded[(y + 1) * pw + x];
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (code === 0 || code === 15) continue;

      const cx = x - 0.5;
      const cy = y - 0.5;
      const topX = cx + 0.5;
      const topY = cy;
      const rightX = cx + 1;
      const rightY = cy + 0.5;
      const bottomX = cx + 0.5;
      const bottomY = cy + 1;
      const leftX = cx;
      const leftY = cy + 0.5;

      switch (code) {
        case 1:
          addSeg(leftX, leftY, bottomX, bottomY);
          break;
        case 2:
          addSeg(bottomX, bottomY, rightX, rightY);
          break;
        case 3:
          addSeg(leftX, leftY, rightX, rightY);
          break;
        case 4:
          addSeg(rightX, rightY, topX, topY);
          break;
        case 5:
          // 4-connected saddle (tr=1, bl=1 separated across empty void diagonal)
          addSeg(leftX, leftY, bottomX, bottomY);
          addSeg(rightX, rightY, topX, topY);
          break;
        case 6:
          addSeg(bottomX, bottomY, topX, topY);
          break;
        case 7:
          addSeg(leftX, leftY, topX, topY);
          break;
        case 8:
          addSeg(topX, topY, leftX, leftY);
          break;
        case 9:
          addSeg(topX, topY, bottomX, bottomY);
          break;
        case 10:
          // 4-connected saddle (tl=1, br=1 separated across empty void diagonal)
          addSeg(topX, topY, leftX, leftY);
          addSeg(bottomX, bottomY, rightX, rightY);
          break;
        case 11:
          addSeg(topX, topY, rightX, rightY);
          break;
        case 12:
          addSeg(rightX, rightY, leftX, leftY);
          break;
        case 13:
          // br=0, tl=tr=bl=1 -> clockwise half-edge from right to bottom
          addSeg(rightX, rightY, bottomX, bottomY);
          break;
        case 14:
          // bl=0, tl=tr=br=1 -> clockwise half-edge from bottom to left
          addSeg(bottomX, bottomY, leftX, leftY);
          break;
      }
    }
  }

  const loops = [];
  for (const [startKey, startList] of adj.entries()) {
    while (startList.length > 0) {
      const rawRing = [];
      let curKey = startKey;
      let closedCleanly = false;

      while (true) {
        const [sx, sy] = curKey.split(",").map(Number);
        rawRing.push({ x: sx, y: sy });
        const nextList = adj.get(curKey);
        if (!nextList || nextList.length === 0) break;

        let pickIdx = nextList.length - 1;
        if (nextList.length > 1 && rawRing.length >= 2) {
          const prevPt = rawRing[rawRing.length - 2];
          const curPt = rawRing[rawRing.length - 1];
          const inDx = curPt.x - prevPt.x;
          const inDy = curPt.y - prevPt.y;
          for (let i = 0; i < nextList.length; i++) {
            const [nx, ny] = nextList[i].split(",").map(Number);
            const outDx = nx - curPt.x;
            const outDy = ny - curPt.y;
            if (inDx * outDy - inDy * outDx > 0) {
              pickIdx = i;
              break;
            }
          }
        }

        const [nextKey] = nextList.splice(pickIdx, 1);
        if (nextKey === startKey) {
          closedCleanly = true;
          break;
        }
        curKey = nextKey;
      }

      if (!closedCleanly || rawRing.length < 3) continue;

      let ring = coalesceColinearClosedRing(rawRing);
      if (ring.length < 3) continue;

      if (simplifyEpsilon > 0 && ring.length >= 8) {
        const pA = ring[0];
        let idxB = 1;
        let maxDistSq = -1;
        for (let i = 1; i < ring.length; i++) {
          const dx = ring[i].x - pA.x;
          const dy = ring[i].y - pA.y;
          const dSq = dx * dx + dy * dy;
          if (dSq > maxDistSq) {
            maxDistSq = dSq;
            idxB = i;
          }
        }
        if (idxB > 0 && idxB < ring.length) {
          const half1 = rdpSimplifyOpen(ring.slice(0, idxB + 1), simplifyEpsilon);
          const half2 = rdpSimplifyOpen([...ring.slice(idxB), ring[0]], simplifyEpsilon);
          const recombined = [...half1.slice(0, -1), ...half2.slice(0, -1)];
          if (recombined.length >= 3) {
            ring = recombined;
          }
        }
      }

      const finalLoop =
        smoothPasses > 0 && ring.length >= 8
          ? chaikinSmoothClosed(ring, smoothPasses, maxCutPx)
          : ring;

      if (finalLoop.length >= 3) {
        loops.push(finalLoop);
      }
    }
  }

  return loops;
}

/**
 * Serializes traced closed contour loops into an even-odd SVG `<path d="...">` string.
 *
 * @param {ArrayLike<number | boolean>} mask
 * @param {number} width
 * @param {number} height
 * @param {number} [simplifyEpsilon=0.25]
 * @param {number} [smoothPasses=1]
 * @returns {string}
 */
export function traceBinaryMaskToSvgPath(
  mask,
  width,
  height,
  simplifyEpsilon = 0.25,
  smoothPasses = 1
) {
  const loops = traceBinaryMaskToContourLoops(mask, width, height, simplifyEpsilon, smoothPasses);
  return loops
    .map((ring) => {
      const cmds = ring
        .map((pt, idx) => `${idx === 0 ? "M" : "L"}${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
        .join(" ");
      return `${cmds} Z`;
    })
    .join(" ");
}

/**
 * Exact O(W * H) Felzenszwalb-Huttenlocher Squared Euclidean Distance Transform
 * evaluated on the `(2*width + 1) x (2*height + 1)` half-pixel lattice.
 *
 * Every sample `(ix, iy)` represents coordinate `(ix * 0.5, iy * 0.5)` in pixel space:
 *   - Even indices lie on pixel corners / edges
 *   - Odd indices lie on pixel centers `(x + 0.5, y + 0.5)`
 *
 * Because `1` half-pixel step equals `0.5 px`, the Euclidean distance `sqrt(sqDist[idx])`
 * in half-pixel steps equals `2 * radiusPx` — i.e., the exact maximum inscribed circle
 * DIAMETER in pixels (`diameterPx = Math.sqrt(sqDist[idx])`).
 *
 * @param {ArrayLike<number | boolean>} solidMask - `1` = solid wood/material, `0` = cut void
 * @param {number} width
 * @param {number} height
 * @param {ArrayLike<number | boolean> | null} [outsideMask=null]
 */
export function computeHalfPixelEdt(solidMask, width, height, outsideMask = null) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("width and height must be positive integers.");
  }
  if (!solidMask || solidMask.length !== width * height) {
    throw new RangeError("solidMask length must equal width * height.");
  }

  const sw = width * 2 + 1;
  const sh = height * 2 + 1;
  const INF = 1e9;
  const sqDist = new Float32Array(sw * sh);

  for (let iy = 0; iy < sh; iy++) {
    const y0 = Math.max(0, (iy - 1) >> 1);
    const y1 = Math.min(height - 1, iy >> 1);
    const onBorderY = iy === 0 || iy === sh - 1;
    const rowOff = iy * sw;
    for (let ix = 0; ix < sw; ix++) {
      if (onBorderY || ix === 0 || ix === sw - 1) {
        sqDist[rowOff + ix] = 0;
        continue;
      }
      const x0 = Math.max(0, (ix - 1) >> 1);
      const x1 = Math.min(width - 1, ix >> 1);
      let touchesSolid = false;
      for (let py = y0; py <= y1 && !touchesSolid; py++) {
        const gRow = py * width;
        for (let px = x0; px <= x1; px++) {
          const gIdx = gRow + px;
          if (solidMask[gIdx] || (outsideMask && outsideMask[gIdx])) {
            touchesSolid = true;
            break;
          }
        }
      }
      sqDist[rowOff + ix] = touchesSolid ? 0 : INF;
    }
  }

  const maxDim = Math.max(sw, sh);
  const vBuf = new Int32Array(maxDim);
  const zBuf = new Float64Array(maxDim + 1);
  const fBuf = new Float64Array(maxDim);

  function edt1D(n) {
    let k = 0;
    vBuf[0] = 0;
    zBuf[0] = -1e12;
    zBuf[1] = 1e12;
    for (let q = 1; q < n; q++) {
      let s =
        (fBuf[q] + q * q - (fBuf[vBuf[k]] + vBuf[k] * vBuf[k])) /
        (2 * q - 2 * vBuf[k]);
      while (s <= zBuf[k]) {
        k--;
        s =
          (fBuf[q] + q * q - (fBuf[vBuf[k]] + vBuf[k] * vBuf[k])) /
          (2 * q - 2 * vBuf[k]);
      }
      k++;
      vBuf[k] = q;
      zBuf[k] = s;
      zBuf[k + 1] = 1e12;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (zBuf[k + 1] < q) k++;
      const dv = q - vBuf[k];
      fBuf[q] = dv * dv + fBuf[vBuf[k]];
    }
  }

  for (let ix = 0; ix < sw; ix++) {
    for (let iy = 0; iy < sh; iy++) fBuf[iy] = sqDist[iy * sw + ix];
    edt1D(sh);
    for (let iy = 0; iy < sh; iy++) sqDist[iy * sw + ix] = fBuf[iy];
  }
  for (let iy = 0; iy < sh; iy++) {
    const rowOff = iy * sw;
    for (let ix = 0; ix < sw; ix++) fBuf[ix] = sqDist[rowOff + ix];
    edt1D(sw);
    for (let ix = 0; ix < sw; ix++) sqDist[rowOff + ix] = fBuf[ix];
  }

  return {
    latticeWidth: sw,
    latticeHeight: sh,
    sqDist,
  };
}

/**
 * Coarse-to-fine (`0.08 px` sub-pixel) Pole-of-Inaccessibility solver finding the
 * maximum inscribed circle inside a closed interior cutout polygon `holePts` while
 * excluding any nested wood islands `nestedIslands`.
 *
 * @param {Array<{ x: number, y: number }>} holePts
 * @param {Array<Array<{ x: number, y: number }>>} [nestedIslands=[]]
 */
export function maxInscribedCircleInContourHole(holePts, nestedIslands = []) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of holePts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const evalClearance = (px, py) => {
    if (!pointInPolygon2D(px, py, holePts)) return -1;
    for (const isl of nestedIslands) {
      if (pointInPolygon2D(px, py, isl)) return -1;
    }
    let minD = Infinity;
    for (let i = 0; i < holePts.length; i++) {
      const d = perpendicularSegmentDistance(
        { x: px, y: py },
        holePts[i],
        holePts[(i + 1) % holePts.length]
      );
      if (d < minD) minD = d;
    }
    for (const isl of nestedIslands) {
      for (let i = 0; i < isl.length; i++) {
        const d = perpendicularSegmentDistance(
          { x: px, y: py },
          isl[i],
          isl[(i + 1) % isl.length]
        );
        if (d < minD) minD = d;
      }
    }
    return minD;
  };

  let bestR = 0;
  let bestX = (minX + maxX) * 0.5;
  let bestY = (minY + maxY) * 0.5;
  const coarseStep = Math.max(0.35, Math.min(maxX - minX, maxY - minY) / 26);

  for (let y = minY; y <= maxY; y += coarseStep) {
    for (let x = minX; x <= maxX; x += coarseStep) {
      const r = evalClearance(x, y);
      if (r > bestR) {
        bestR = r;
        bestX = x;
        bestY = y;
      }
    }
  }

  const fineStep = 0.08;
  const fMinX = Math.max(minX, bestX - coarseStep);
  const fMaxX = Math.min(maxX, bestX + coarseStep);
  const fMinY = Math.max(minY, bestY - coarseStep);
  const fMaxY = Math.min(maxY, bestY + coarseStep);
  for (let y = fMinY; y <= fMaxY; y += fineStep) {
    for (let x = fMinX; x <= fMaxX; x += fineStep) {
      const r = evalClearance(x, y);
      if (r > bestR) {
        bestR = r;
        bestX = x;
        bestY = y;
      }
    }
  }

  return { radiusPx: bestR, x: bestX, y: bestY };
}

/**
 * Resolves all enclosed interior fretwork/stencil cutouts using the Half-Pixel `(2W+1)×(2H+1)`
 * Euclidean Distance Transform + Smoothed Polygon Pole-of-Inaccessibility refinement:
 *   1. Automatically seals un-drillable micro-pinholes smaller than `minDrillMm + clearanceMarginMm`
 *      (covering numbered wire-gauge bits `#65 / 0.89 mm` through `#44 / 2.18 mm`).
 *   2. Places centered `PilotDrillPoint` crosshairs at the smoothed polygon Pole-of-Inaccessibility.
 *   3. Enforces exact `1:1` parity (`survivingHoleLoopCount === drillPoints.length`).
 *
 * @param {ArrayLike<number | boolean>} woodMask
 * @param {number} width
 * @param {number} height
 * @param {{
 *   pxPerMm?: number,
 *   minDrillMm?: number,
 *   clearanceMarginMm?: number,
 *   outsideMask?: ArrayLike<number | boolean> | null,
 *   simplifyEpsilon?: number,
 *   smoothPasses?: number,
 *   mutateMask?: boolean
 * }} [options={}]
 */
export function resolveInteriorCutoutsAndSealPinholes(
  woodMask,
  width,
  height,
  options = {}
) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("width and height must be positive integers.");
  }
  const total = width * height;
  if (!woodMask || woodMask.length !== total) {
    throw new RangeError("woodMask length must equal width * height.");
  }

  const pxPerMm = options.pxPerMm ?? 40 / 25.4;
  const minDrillMm = options.minDrillMm ?? 1.32; // #55 wire-gauge bit default for 1/2" plaques
  const clearanceMarginMm = options.clearanceMarginMm ?? 0.18;
  const minClearDiameterMm = minDrillMm + clearanceMarginMm;
  const outsideMask = options.outsideMask ?? null;
  const simplifyEpsilon = options.simplifyEpsilon ?? 0.25;
  const smoothPasses = options.smoothPasses ?? 1;

  const wood =
    options.mutateMask && woodMask instanceof Uint8Array
      ? woodMask
      : new Uint8Array(total);
  if (wood !== woodMask) {
    for (let i = 0; i < total; i++) wood[i] = woodMask[i] ? 1 : 0;
  }

  const visitedWaste = new Uint8Array(total);
  const queue = new Int32Array(total);
  const sealedPinholes = [];

  for (let pass = 0; pass < 2; pass++) {
    visitedWaste.fill(0);
    let head = 0;
    let tail = 0;

    // Seed exterior open waste connected to grid perimeter or outsideMask
    for (let i = 0; i < total; i++) {
      const x = i % width;
      const y = (i - x) / width;
      const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      const isOut = outsideMask ? Boolean(outsideMask[i]) : false;
      if (isOut || (isEdge && wood[i] === 0)) {
        visitedWaste[i] = 1;
        queue[tail++] = i;
      }
    }

    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % width;
      const cy = (cur - cx) / width;
      if (cx > 0 && !visitedWaste[cur - 1] && wood[cur - 1] === 0) {
        visitedWaste[cur - 1] = 1;
        queue[tail++] = cur - 1;
      }
      if (cx < width - 1 && !visitedWaste[cur + 1] && wood[cur + 1] === 0) {
        visitedWaste[cur + 1] = 1;
        queue[tail++] = cur + 1;
      }
      if (cy > 0 && !visitedWaste[cur - width] && wood[cur - width] === 0) {
        visitedWaste[cur - width] = 1;
        queue[tail++] = cur - width;
      }
      if (cy < height - 1 && !visitedWaste[cur + width] && wood[cur + width] === 0) {
        visitedWaste[cur + width] = 1;
        queue[tail++] = cur + width;
      }
    }

    let hasInteriorWaste = false;
    for (let i = 0; i < total; i++) {
      if (!visitedWaste[i] && wood[i] === 0) {
        hasInteriorWaste = true;
        break;
      }
    }
    if (!hasInteriorWaste) {
      const finalLoops = traceBinaryMaskToContourLoops(
        wood,
        width,
        height,
        simplifyEpsilon,
        smoothPasses
      );
      const holeCount = finalLoops.filter((pts) => polygonSignedArea2D(pts) < 0).length;
      return {
        sealedWoodMask: wood,
        drillPoints: [],
        sealedPinholeCount: sealedPinholes.length,
        sealedPinholes,
        survivingHoleLoopCount: holeCount,
        oneToOneParity: holeCount === 0,
      };
    }

    const { latticeWidth: sw, sqDist: dt } = computeHalfPixelEdt(
      wood,
      width,
      height,
      outsideMask
    );

    const candidates = [];
    for (let i = 0; i < total; i++) {
      if (visitedWaste[i] || wood[i] !== 0) continue;
      let cHead = 0;
      let cTail = 0;
      visitedWaste[i] = 1;
      queue[cTail++] = i;

      let bestDtSq = -1;
      let bestIx = (i % width) * 2 + 1;
      let bestIy = Math.floor(i / width) * 2 + 1;

      while (cHead < cTail) {
        const cur = queue[cHead++];
        const cx = cur % width;
        const cy = (cur - cx) / width;

        const baseIx = cx * 2;
        const baseIy = cy * 2;
        for (let dy = 0; dy <= 2; dy++) {
          const sRow = (baseIy + dy) * sw;
          for (let dx = 0; dx <= 2; dx++) {
            const valSq = dt[sRow + baseIx + dx];
            if (valSq > bestDtSq) {
              bestDtSq = valSq;
              bestIx = baseIx + dx;
              bestIy = baseIy + dy;
            }
          }
        }

        if (cx > 0 && !visitedWaste[cur - 1] && wood[cur - 1] === 0) {
          visitedWaste[cur - 1] = 1;
          queue[cTail++] = cur - 1;
        }
        if (cx < width - 1 && !visitedWaste[cur + 1] && wood[cur + 1] === 0) {
          visitedWaste[cur + 1] = 1;
          queue[cTail++] = cur + 1;
        }
        if (cy > 0 && !visitedWaste[cur - width] && wood[cur - width] === 0) {
          visitedWaste[cur - width] = 1;
          queue[cTail++] = cur - width;
        }
        if (cy < height - 1 && !visitedWaste[cur + width] && wood[cur + width] === 0) {
          visitedWaste[cur + width] = 1;
          queue[cTail++] = cur + width;
        }
      }

      const rawDiameterPx = bestDtSq > 0 ? Math.sqrt(bestDtSq) : 0;
      const rawDiameterMm = rawDiameterPx / pxPerMm;
      const effectiveDiameterMm = Math.max(0, rawDiameterMm - 0.14);

      if (effectiveDiameterMm < minClearDiameterMm) {
        for (let k = 0; k < cTail; k++) {
          wood[queue[k]] = 1;
        }
        sealedPinholes.push({
          pixelCount: cTail,
          rawDiameterMm: Number(rawDiameterMm.toFixed(2)),
          effectiveDiameterMm: Number(effectiveDiameterMm.toFixed(2)),
        });
      } else {
        candidates.push({
          x: bestIx * 0.5,
          y: bestIy * 0.5,
          pixels: queue.slice(0, cTail),
          rawDiameterMm,
        });
      }
    }

    if (candidates.length === 0) {
      const finalLoops = traceBinaryMaskToContourLoops(
        wood,
        width,
        height,
        simplifyEpsilon,
        smoothPasses
      );
      const holeCount = finalLoops.filter((pts) => polygonSignedArea2D(pts) < 0).length;
      return {
        sealedWoodMask: wood,
        drillPoints: [],
        sealedPinholeCount: sealedPinholes.length,
        sealedPinholes,
        survivingHoleLoopCount: holeCount,
        oneToOneParity: holeCount === 0,
      };
    }

    const loops = traceBinaryMaskToContourLoops(
      wood,
      width,
      height,
      simplifyEpsilon,
      smoothPasses
    );
    const holeLoops = [];
    const islandLoops = [];

    for (const pts of loops) {
      const area = polygonSignedArea2D(pts);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if (area < 0) {
        holeLoops.push({ pts, area: -area, minX, maxX, minY, maxY });
      } else if (area > 0) {
        islandLoops.push({ pts, minX, maxX, minY, maxY });
      }
    }

    const polyMinDiaMm = Math.max(0.4, minClearDiameterMm - 0.1);
    let sealedInPolyPass = false;
    const finalPoints = [];

    for (const cand of candidates) {
      let matchedHole = holeLoops.find(
        (hl) =>
          cand.x >= hl.minX &&
          cand.x <= hl.maxX &&
          cand.y >= hl.minY &&
          cand.y <= hl.maxY &&
          pointInPolygon2D(cand.x, cand.y, hl.pts)
      );
      if (!matchedHole && cand.pixels.length > 0) {
        const p0 = cand.pixels[0];
        const px = (p0 % width) + 0.5;
        const py = Math.floor(p0 / width) + 0.5;
        matchedHole = holeLoops.find(
          (hl) =>
            px >= hl.minX &&
            px <= hl.maxX &&
            py >= hl.minY &&
            py <= hl.maxY &&
            pointInPolygon2D(px, py, hl.pts)
        );
      }

      if (!matchedHole) {
        for (let k = 0; k < cand.pixels.length; k++) {
          wood[cand.pixels[k]] = 1;
        }
        sealedPinholes.push({
          pixelCount: cand.pixels.length,
          rawDiameterMm: Number(cand.rawDiameterMm.toFixed(2)),
          effectiveDiameterMm: 0,
        });
        sealedInPolyPass = true;
        continue;
      }

      const nested = islandLoops
        .filter(
          (il) =>
            il.minX > matchedHole.minX &&
            il.maxX < matchedHole.maxX &&
            il.minY > matchedHole.minY &&
            il.maxY < matchedHole.maxY &&
            pointInPolygon2D(il.pts[0].x, il.pts[0].y, matchedHole.pts)
        )
        .map((il) => il.pts);

      const insc = maxInscribedCircleInContourHole(matchedHole.pts, nested);
      const polyDiaMm = (insc.radiusPx * 2) / pxPerMm;

      if (polyDiaMm < polyMinDiaMm) {
        for (let k = 0; k < cand.pixels.length; k++) {
          wood[cand.pixels[k]] = 1;
        }
        sealedPinholes.push({
          pixelCount: cand.pixels.length,
          rawDiameterMm: Number(cand.rawDiameterMm.toFixed(2)),
          effectiveDiameterMm: Number(polyDiaMm.toFixed(2)),
        });
        sealedInPolyPass = true;
      } else {
        finalPoints.push({
          id: finalPoints.length + 1,
          x: Number(insc.x.toFixed(2)),
          y: Number(insc.y.toFixed(2)),
          pixelCount: cand.pixels.length,
          clearanceMm: Number((insc.radiusPx / pxPerMm).toFixed(2)),
          diameterMm: Number(polyDiaMm.toFixed(2)),
        });
      }
    }

    if (!sealedInPolyPass || pass === 1) {
      const verifiedLoops = sealedInPolyPass
        ? traceBinaryMaskToContourLoops(wood, width, height, simplifyEpsilon, smoothPasses)
        : loops;
      const survivingHoleLoopCount = verifiedLoops.filter(
        (pts) => polygonSignedArea2D(pts) < 0
      ).length;
      return {
        sealedWoodMask: wood,
        drillPoints: finalPoints,
        sealedPinholeCount: sealedPinholes.length,
        sealedPinholes,
        survivingHoleLoopCount,
        oneToOneParity: survivingHoleLoopCount === finalPoints.length,
      };
    }
  }

  return {
    sealedWoodMask: wood,
    drillPoints: [],
    sealedPinholeCount: sealedPinholes.length,
    sealedPinholes,
    survivingHoleLoopCount: 0,
    oneToOneParity: true,
  };
}

/**
 * Measures the physical cut-to-cut outer bounding box of traced contour loops at `pxPerIn`
 * (default `40 px/in` -> `1 px = 0.025 in = 0.635 mm`).
 *
 * @param {Array<Array<{ x: number, y: number }>>} loops
 * @param {number} [pxPerIn=40]
 */
export function measureContourOuterBounds(loops, pxPerIn = 40) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const ring of loops) {
    for (const pt of ring) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  if (!Number.isFinite(minX)) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      widthPx: 0,
      heightPx: 0,
      widthInches: 0,
      heightInches: 0,
      widthMm: 0,
      heightMm: 0,
    };
  }

  const widthPx = Number((maxX - minX).toFixed(4));
  const heightPx = Number((maxY - minY).toFixed(4));
  const widthInches = Number((widthPx / pxPerIn).toFixed(4));
  const heightInches = Number((heightPx / pxPerIn).toFixed(4));

  return {
    minX: Number(minX.toFixed(4)),
    maxX: Number(maxX.toFixed(4)),
    minY: Number(minY.toFixed(4)),
    maxY: Number(maxY.toFixed(4)),
    widthPx,
    heightPx,
    widthInches,
    heightInches,
    widthMm: Number((widthInches * 25.4).toFixed(2)),
    heightMm: Number((heightInches * 25.4).toFixed(2)),
  };
}

/**
 * Calibrates a raw scroll-saw plaque binary grid at `40 px/in` (`1 px = 0.635 mm`):
 *  - Enforces a strict flat tabletop plane below `flatBottomY` (clipping any protruding
 *    descenders while preserving full-width `[0 .. gridW]` vertical toe micro-lands of
 *    `toeLandPx` rows so Marching Squares outer width equals `widthInches * 25.4 mm` with
 *    `0.00 mm` discrepancy).
 *  - Tightly crops vertical empty whitespace to `[minWoodY .. maxWoodY]` and snaps `gridH`
 *    to an even pixel count (`2k / 40 = exact 0.05"` rational multiple).
 *
 * @param {ArrayLike<number | boolean>} rawWoodMask
 * @param {number} gridW
 * @param {number} rawGridH
 * @param {{
 *   pxPerIn?: number,
 *   flatBottomY?: number,
 *   enforceFullWidthBaseToe?: boolean,
 *   toeLandPx?: number
 * }} [options={}]
 */
export function calibrateCutToCutPlaqueBounds(
  rawWoodMask,
  gridW,
  rawGridH,
  options = {}
) {
  const pxPerIn = options.pxPerIn ?? 40;
  const flatBottomY = options.flatBottomY ?? -1;
  const toeLandPx = options.toeLandPx ?? 4;
  const enforceToe = options.enforceFullWidthBaseToe ?? false;

  const work = new Uint8Array(gridW * rawGridH);
  for (let y = 0; y < rawGridH; y++) {
    const rowOff = y * gridW;
    if (flatBottomY > 0 && y >= flatBottomY) continue;
    for (let x = 0; x < gridW; x++) {
      work[rowOff + x] = rawWoodMask[rowOff + x] ? 1 : 0;
    }
  }

  if (enforceToe && flatBottomY >= toeLandPx) {
    for (let y = flatBottomY - toeLandPx; y < flatBottomY; y++) {
      work[y * gridW] = 1;
      work[y * gridW + (gridW - 1)] = 1;
    }
  }

  let minWoodY = rawGridH;
  let maxWoodY = -1;
  for (let y = 0; y < rawGridH; y++) {
    const rowOff = y * gridW;
    for (let x = 0; x < gridW; x++) {
      if (work[rowOff + x] === 1) {
        if (y < minWoodY) minWoodY = y;
        if (y > maxWoodY) maxWoodY = y;
        break;
      }
    }
  }

  if (maxWoodY < minWoodY) {
    minWoodY = 0;
    maxWoodY = Math.min(rawGridH - 1, 39);
  }

  if ((maxWoodY - minWoodY + 1) % 2 === 1) {
    if (flatBottomY > 0 && maxWoodY + 1 < rawGridH) {
      const nextRow = (maxWoodY + 1) * gridW;
      const prevRow = maxWoodY * gridW;
      for (let x = 0; x < gridW; x++) {
        work[nextRow + x] = work[prevRow + x];
      }
      maxWoodY += 1;
    } else if (minWoodY > 0) {
      minWoodY -= 1;
    } else if (maxWoodY + 1 < rawGridH) {
      maxWoodY += 1;
    }
  }

  const gridH = Math.max(2, maxWoodY - minWoodY + 1);
  const croppedMask = new Uint8Array(gridW * gridH);
  for (let y = 0; y < gridH; y++) {
    const srcOff = (minWoodY + y) * gridW;
    const dstOff = y * gridW;
    for (let x = 0; x < gridW; x++) {
      croppedMask[dstOff + x] = work[srcOff + x];
    }
  }

  const widthInches = Number((gridW / pxPerIn).toFixed(4));
  const heightInches = Number((gridH / pxPerIn).toFixed(4));

  return {
    croppedMask,
    gridW,
    gridH,
    pxPerIn,
    pxPerMm: pxPerIn / 25.4,
    widthInches,
    heightInches,
    targetWidthMm: Number((widthInches * 25.4).toFixed(2)),
    targetHeightMm: Number((heightInches * 25.4).toFixed(2)),
  };
}
