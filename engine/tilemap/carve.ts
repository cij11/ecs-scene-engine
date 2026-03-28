/**
 * Carving system — subtract shapes from tilemap tiles.
 *
 * Carving zeroes density values within a shape, then regenerates
 * marching squares edges for the affected chunks.
 */

import type { Vec2, TileSet, TileMapLayer, Chunk } from "./types.js";
import { packCellKey, cellToChunk, createChunk } from "./types.js";
import { densityGridSide, marchingSquares } from "./density.js";
import { initChunkDensity } from "./polygon.js";

export interface CarveShape {
  type: "circle" | "polygon";
  position: Vec2; // centre in tilemap space
  radius?: number; // for circles
  polygon?: Vec2[]; // for arbitrary shapes (world space, relative to position)
}

/** Map of chunk keys to chunks */
export type ChunkMap = Map<bigint, Chunk>;

/**
 * Carve a shape from the tilemap, modifying density grids and
 * regenerating collision edges.
 */
export function carve(
  layer: TileMapLayer,
  tileSet: TileSet,
  chunks: ChunkMap,
  shape: CarveShape,
  gridResolution: number = 2,
): void {
  // Determine affected tile range from shape bounding box
  const bounds = getShapeBounds(shape);
  const minCell = {
    x: Math.floor(bounds.minX / tileSet.tileSize),
    y: Math.floor(bounds.minY / tileSet.tileSize),
  };
  const maxCell = {
    x: Math.floor(bounds.maxX / tileSet.tileSize),
    y: Math.floor(bounds.maxY / tileSet.tileSize),
  };

  // Find affected chunks
  const affectedChunks = new Set<bigint>();

  for (let cy = minCell.y; cy <= maxCell.y; cy++) {
    for (let cx = minCell.x; cx <= maxCell.x; cx++) {
      const { cx: chunkX, cy: chunkY } = cellToChunk(cx, cy, layer.chunkSize);
      const chunkKey = packCellKey(chunkX, chunkY);
      affectedChunks.add(chunkKey);
    }
  }

  // Process each affected chunk
  for (const chunkKey of affectedChunks) {
    let chunk = chunks.get(chunkKey);
    const { x: chunkX, y: chunkY } = unpackChunkKey(chunkKey);

    if (!chunk) {
      chunk = createChunk(chunkX, chunkY, gridResolution);
      chunks.set(chunkKey, chunk);
    }

    // Initialise density grid on first carve
    if (!chunk.densityGrid) {
      chunk.densityGrid = initChunkDensity(layer.chunkSize, gridResolution, (tileX, tileY) => {
        const worldTileX = chunkX * layer.chunkSize + tileX;
        const worldTileY = chunkY * layer.chunkSize + tileY;
        const cellKey = packCellKey(worldTileX, worldTileY);
        const cell = layer.cells.get(cellKey);
        if (!cell) return null;
        const source = tileSet.sources.get(cell.sourceId);
        if (!source) return null;
        const tileData = source.tiles.get(cell.tileId);
        return tileData?.polygon ?? null;
      });
    }

    // Apply carving to density grid
    const side = densityGridSide(layer.chunkSize, gridResolution);
    const chunkWorldX = chunkX * layer.chunkSize * tileSet.tileSize;
    const chunkWorldY = chunkY * layer.chunkSize * tileSet.tileSize;
    const cellSize = tileSet.tileSize / gridResolution;

    for (let gy = 0; gy < side; gy++) {
      for (let gx = 0; gx < side; gx++) {
        if (chunk.densityGrid[gy * side + gx] === 0) continue;

        const worldX = chunkWorldX + gx * cellSize;
        const worldY = chunkWorldY + gy * cellSize;

        if (isPointInShape({ x: worldX, y: worldY }, shape)) {
          chunk.densityGrid[gy * side + gx] = 0;
        }
      }
    }

    // Regenerate collision edges
    chunk.collisionEdges = marchingSquares(chunk.densityGrid, layer.chunkSize, gridResolution);
    chunk.dirty = true;
    chunk.physicsVersion++;
  }
}

/** Test if a point is inside a carve shape */
function isPointInShape(point: Vec2, shape: CarveShape): boolean {
  if (shape.type === "circle" && shape.radius !== undefined) {
    const dx = point.x - shape.position.x;
    const dy = point.y - shape.position.y;
    return dx * dx + dy * dy <= shape.radius * shape.radius;
  }
  if (shape.type === "polygon" && shape.polygon) {
    // Polygon vertices are relative to shape.position
    const translated = shape.polygon.map((v) => ({
      x: v.x + shape.position.x,
      y: v.y + shape.position.y,
    }));
    return pointInPolygonRaycast(point, translated);
  }
  return false;
}

function pointInPolygonRaycast(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    if (pi.y > point.y !== pj.y > point.y) {
      const intersectX = pj.x + ((point.y - pj.y) / (pi.y - pj.y)) * (pi.x - pj.x);
      if (point.x < intersectX) inside = !inside;
    }
  }
  return inside;
}

function getShapeBounds(shape: CarveShape): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (shape.type === "circle" && shape.radius !== undefined) {
    return {
      minX: shape.position.x - shape.radius,
      minY: shape.position.y - shape.radius,
      maxX: shape.position.x + shape.radius,
      maxY: shape.position.y + shape.radius,
    };
  }
  if (shape.type === "polygon" && shape.polygon) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const v of shape.polygon) {
      const wx = v.x + shape.position.x;
      const wy = v.y + shape.position.y;
      if (wx < minX) minX = wx;
      if (wy < minY) minY = wy;
      if (wx > maxX) maxX = wx;
      if (wy > maxY) maxY = wy;
    }
    return { minX, minY, maxX, maxY };
  }
  return {
    minX: shape.position.x,
    minY: shape.position.y,
    maxX: shape.position.x,
    maxY: shape.position.y,
  };
}

function unpackChunkKey(key: bigint): { x: number; y: number } {
  const uy = Number(key & 0xffffffffn);
  const ux = Number((key >> 32n) & 0xffffffffn);
  const x = ux > 0x7fffffff ? ux - 0x100000000 : ux;
  const y = uy > 0x7fffffff ? uy - 0x100000000 : uy;
  return { x, y };
}
