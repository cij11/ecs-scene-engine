/**
 * Polygon utilities for tilemap — point-in-polygon test and
 * density grid initialisation from tile polygons.
 */

import type { Vec2 } from "./types.js";
import { allocateDensityGrid, densityGridSide } from "./density.js";

/**
 * Point-in-polygon test using ray casting algorithm.
 * Works for convex and concave polygons.
 */
export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    if (pi.y > point.y !== pj.y > point.y) {
      const intersectX = pj.x + ((point.y - pj.y) / (pi.y - pj.y)) * (pi.x - pj.x);
      if (point.x < intersectX) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * Initialise a density grid for a single tile from its polygon.
 *
 * The polygon is in [0,1] local tile space. The grid covers
 * the tile at the given resolution (subcells per tile side).
 *
 * @param polygon tile polygon in [0,1] local space
 * @param resolution subcells per tile side (default 2)
 * @returns Uint8Array density grid for one tile (resolution+1 samples per side)
 */
export function initTileDensity(polygon: Vec2[], resolution: number = 2): Uint8Array {
  const side = resolution + 1;
  const grid = new Uint8Array(side * side);

  for (let gy = 0; gy < side; gy++) {
    for (let gx = 0; gx < side; gx++) {
      const point: Vec2 = {
        x: gx / resolution,
        y: gy / resolution,
      };
      // Points exactly on the polygon boundary count as inside
      grid[gy * side + gx] = pointInPolygon(point, polygon) || isOnEdge(point, polygon) ? 255 : 0;
    }
  }

  return grid;
}

/**
 * Initialise a chunk's density grid from tile polygons.
 *
 * For each tile in the chunk, sample the tile's polygon at grid resolution.
 *
 * @param chunkSize tiles per chunk side
 * @param resolution subcells per tile side
 * @param getTilePolygon function that returns the polygon for a tile at (tileX, tileY) in chunk-local coords, or null if no tile
 */
export function initChunkDensity(
  chunkSize: number,
  resolution: number,
  getTilePolygon: (tileX: number, tileY: number) => Vec2[] | null,
): Uint8Array {
  const side = densityGridSide(chunkSize, resolution);
  const grid = allocateDensityGrid(chunkSize, resolution);

  for (let tileY = 0; tileY < chunkSize; tileY++) {
    for (let tileX = 0; tileX < chunkSize; tileX++) {
      const polygon = getTilePolygon(tileX, tileY);
      if (!polygon) continue;

      // Sample grid points for this tile
      for (let sy = 0; sy <= resolution; sy++) {
        for (let sx = 0; sx <= resolution; sx++) {
          const gx = tileX * resolution + sx;
          const gy = tileY * resolution + sy;

          // Point in tile-local [0,1] space
          const localPoint: Vec2 = {
            x: sx / resolution,
            y: sy / resolution,
          };

          if (pointInPolygon(localPoint, polygon) || isOnEdge(localPoint, polygon)) {
            grid[gy * side + gx] = 255;
          }
        }
      }
    }
  }

  return grid;
}

/** Check if a point lies exactly on a polygon edge (within epsilon) */
function isOnEdge(point: Vec2, polygon: Vec2[], epsilon: number = 0.001): boolean {
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;

    // Check if point is on the line segment pi-pj
    const dx = pi.x - pj.x;
    const dy = pi.y - pj.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < epsilon * epsilon) continue;

    const t = ((point.x - pj.x) * dx + (point.y - pj.y) * dy) / len2;
    if (t < -epsilon || t > 1 + epsilon) continue;

    const closestX = pj.x + t * dx;
    const closestY = pj.y + t * dy;
    const dist2 = (point.x - closestX) ** 2 + (point.y - closestY) ** 2;
    if (dist2 < epsilon * epsilon) return true;
  }
  return false;
}
