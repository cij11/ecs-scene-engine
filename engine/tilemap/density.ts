/**
 * DensityGrid and marching squares for terrain carving.
 *
 * The density grid is a scalar field where each value represents
 * terrain solidity (255 = fully solid, 0 = empty).
 * Marching squares extracts the terrain boundary as edge chains.
 */

import type { Vec2 } from "./types.js";

/**
 * Allocate a density grid for a chunk.
 * @param chunkSize tiles per chunk side
 * @param resolution subcells per tile side
 * @returns Uint8Array of size (chunkSize * resolution + 1)^2
 *          The +1 accounts for corner samples (marching squares needs N+1 samples for N cells)
 */
export function allocateDensityGrid(chunkSize: number, resolution: number): Uint8Array {
  const side = chunkSize * resolution + 1;
  return new Uint8Array(side * side);
}

/** Fill the entire density grid with a value (255 = solid, 0 = empty) */
export function fillDensityGrid(grid: Uint8Array, value: number): void {
  grid.fill(value);
}

/** Get the side length of a density grid */
export function densityGridSide(chunkSize: number, resolution: number): number {
  return chunkSize * resolution + 1;
}

/** Sample the density grid at (gx, gy) */
function sample(grid: Uint8Array, side: number, gx: number, gy: number): number {
  if (gx < 0 || gx >= side || gy < 0 || gy >= side) return 0;
  return grid[gy * side + gx]!;
}

/**
 * Marching squares: extract terrain boundary edges from a density grid.
 *
 * Returns an array of line segments. Each segment is [start, end] in
 * grid-normalised coordinates (0 to chunkSize).
 *
 * @param grid the density grid
 * @param chunkSize tiles per chunk side
 * @param resolution subcells per tile side
 * @param threshold density value threshold (default 128)
 */
export function marchingSquares(
  grid: Uint8Array,
  chunkSize: number,
  resolution: number,
  threshold: number = 128,
): Vec2[][] {
  const side = densityGridSide(chunkSize, resolution);
  const cellCount = side - 1; // number of marching squares cells per side
  const cellSize = chunkSize / cellCount; // world size per marching squares cell
  const segments: Vec2[][] = [];

  for (let cy = 0; cy < cellCount; cy++) {
    for (let cx = 0; cx < cellCount; cx++) {
      // Sample four corners (bottom-left, bottom-right, top-right, top-left)
      const bl = sample(grid, side, cx, cy);
      const br = sample(grid, side, cx + 1, cy);
      const tr = sample(grid, side, cx + 1, cy + 1);
      const tl = sample(grid, side, cx, cy + 1);

      // Build 4-bit case index
      const caseIndex =
        (bl >= threshold ? 1 : 0) |
        (br >= threshold ? 2 : 0) |
        (tr >= threshold ? 4 : 0) |
        (tl >= threshold ? 8 : 0);

      if (caseIndex === 0 || caseIndex === 15) continue; // fully empty or fully solid

      // Interpolate edge positions
      const x0 = cx * cellSize;
      const y0 = cy * cellSize;
      const x1 = (cx + 1) * cellSize;
      const y1 = (cy + 1) * cellSize;

      // Edge midpoints (with interpolation)
      const bottom = lerp1d(x0, x1, bl, br, threshold);
      const right = lerp1d(y0, y1, br, tr, threshold);
      const top = lerp1d(x0, x1, tl, tr, threshold);
      const left = lerp1d(y0, y1, bl, tl, threshold);

      const b: Vec2 = { x: bottom, y: y0 };
      const r: Vec2 = { x: x1, y: right };
      const t: Vec2 = { x: top, y: y1 };
      const l: Vec2 = { x: x0, y: left };

      // Lookup table for the 16 cases
      switch (caseIndex) {
        case 1:
          segments.push([b, l]);
          break;
        case 2:
          segments.push([r, b]);
          break;
        case 3:
          segments.push([r, l]);
          break;
        case 4:
          segments.push([t, r]);
          break;
        case 5:
          // Saddle point — disambiguate with centre value
          segments.push([t, l]);
          segments.push([r, b]);
          break;
        case 6:
          segments.push([t, b]);
          break;
        case 7:
          segments.push([t, l]);
          break;
        case 8:
          segments.push([l, t]);
          break;
        case 9:
          segments.push([b, t]);
          break;
        case 10:
          // Saddle point — disambiguate with centre value
          segments.push([b, l]);
          segments.push([t, r]);
          break;
        case 11:
          segments.push([r, t]);
          break;
        case 12:
          segments.push([l, r]);
          break;
        case 13:
          segments.push([b, r]);
          break;
        case 14:
          segments.push([l, b]);
          break;
      }
    }
  }

  return segments;
}

/** Linear interpolation for edge position between two samples */
function lerp1d(pos0: number, pos1: number, val0: number, val1: number, threshold: number): number {
  if (Math.abs(val1 - val0) < 0.001) return (pos0 + pos1) / 2;
  const t = (threshold - val0) / (val1 - val0);
  return pos0 + t * (pos1 - pos0);
}
