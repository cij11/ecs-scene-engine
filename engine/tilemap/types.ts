/**
 * Tilemap types — using Godot terminology where possible.
 *
 * Coordinate system: lower-left corner of lower-left cell at (0,0).
 * Centre of cell (0,0) is at (0.5, 0.5) in tilemap space.
 */

export interface Vec2 {
  x: number;
  y: number;
}

// --- TileSet (resource) ---

export interface TileData {
  polygon: Vec2[]; // arbitrary polygon, vertices in [0,1] local space
  physicsPolygons: Vec2[][]; // collision shapes (may differ from visual)
  customData: Record<string, unknown>;
}

export interface TileSetSource {
  id: number;
  tiles: Map<number, TileData>; // tileId → TileData
}

export interface TileSet {
  tileSize: number; // world units per tile (default 1)
  sources: Map<number, TileSetSource>; // sourceId → TileSetSource
}

// --- TileMapLayer ---

export interface CellData {
  sourceId: number;
  tileId: number;
  alternativeId: number; // for rotations/variants
}

/** Pack (x, y) into a single key for Map storage (supports negative coords) */
export function packCellKey(x: number, y: number): bigint {
  const ux = BigInt(x | 0) & 0xffffffffn;
  const uy = BigInt(y | 0) & 0xffffffffn;
  return (ux << 32n) | uy;
}

/** Unpack a cell key back to (x, y) */
export function unpackCellKey(key: bigint): { x: number; y: number } {
  const uy = Number(key & 0xffffffffn);
  const ux = Number((key >> 32n) & 0xffffffffn);
  // Convert back to signed 32-bit
  const x = ux > 0x7fffffff ? ux - 0x100000000 : ux;
  const y = uy > 0x7fffffff ? uy - 0x100000000 : uy;
  return { x, y };
}

export interface TileMapLayer {
  tileSetId: number;
  cells: Map<bigint, CellData>;
  chunkSize: number; // tiles per chunk side (default 32)
}

// --- Chunk ---

export interface Chunk {
  cx: number; // chunk grid x
  cy: number; // chunk grid y
  densityGrid: Uint8Array | null; // null until first carve
  gridResolution: number; // subcells per tile side (default 2)
  dirty: boolean;
  physicsVersion: number;
  networkVersion: number;
  collisionEdges: Vec2[][] | null; // cached marching squares output
}

// --- Coordinate helpers ---

/** Convert cell grid position to world-space position (lower-left corner of cell) */
export function cellToWorld(cellX: number, cellY: number, tileSize: number = 1): Vec2 {
  return { x: cellX * tileSize, y: cellY * tileSize };
}

/** Convert cell grid position to world-space centre of cell */
export function cellCentre(cellX: number, cellY: number, tileSize: number = 1): Vec2 {
  return { x: (cellX + 0.5) * tileSize, y: (cellY + 0.5) * tileSize };
}

/** Convert world-space position to cell grid position (floored) */
export function worldToCell(
  worldX: number,
  worldY: number,
  tileSize: number = 1,
): { x: number; y: number } {
  return { x: Math.floor(worldX / tileSize), y: Math.floor(worldY / tileSize) };
}

/** Convert cell position to chunk position */
export function cellToChunk(
  cellX: number,
  cellY: number,
  chunkSize: number = 32,
): { cx: number; cy: number } {
  return {
    cx: Math.floor(cellX / chunkSize),
    cy: Math.floor(cellY / chunkSize),
  };
}

// --- Factory helpers ---

export function createTileSet(tileSize: number = 1): TileSet {
  return { tileSize, sources: new Map() };
}

export function createTileSetSource(id: number): TileSetSource {
  return { id, tiles: new Map() };
}

export function createTileData(polygon: Vec2[]): TileData {
  return { polygon, physicsPolygons: [polygon], customData: {} };
}

export function createTileMapLayer(tileSetId: number, chunkSize: number = 32): TileMapLayer {
  return { tileSetId, cells: new Map(), chunkSize };
}

export function createChunk(cx: number, cy: number, gridResolution: number = 2): Chunk {
  return {
    cx,
    cy,
    densityGrid: null,
    gridResolution,
    dirty: false,
    physicsVersion: 0,
    networkVersion: 0,
    collisionEdges: null,
  };
}

// --- Standard tile polygons ---

export const TILE_FULL: Vec2[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export const TILE_TRIANGLE_BL: Vec2[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];

export const TILE_TRIANGLE_BR: Vec2[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
];

export const TILE_HALF_BOTTOM: Vec2[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0, y: 0.5 },
];

export const TILE_HALF_LEFT: Vec2[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 0.5, y: 1 },
  { x: 0, y: 1 },
];
