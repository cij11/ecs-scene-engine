/**
 * Tilemap renderer — creates Three.js geometry from tile polygons
 * and density grids. Also provides debug overlay rendering.
 */

import * as THREE from "three";
import type { Vec2, TileSet, TileMapLayer } from "./types.js";
import { packCellKey } from "./types.js";
import type { ChunkMap } from "./carve.js";
import { densityGridSide } from "./density.js";

const TILE_COLORS: number[] = [
  0x4a9e4a, // green
  0x8b6914, // brown
  0x6e6e6e, // grey
  0x4a6e9e, // blue-grey
  0x9e4a4a, // red-brown
];

/** Default colour for carved-chunk density quads */
const CARVED_TILE_COLOR = 0x4a9e4a;

export interface TileMapRenderState {
  group: THREE.Group;
  tileGroup: THREE.Group;
  debugGroup: THREE.Group;
  tileMeshes: Map<bigint, THREE.Mesh>;
  /** Meshes generated from density grids for carved chunks, keyed by chunk key */
  carvedChunkMeshes: Map<bigint, THREE.Mesh>;
  /** Track which chunk physicsVersions we have rendered */
  carvedChunkVersions: Map<bigint, number>;
  debugVisible: boolean;
}

export function createTileMapRenderState(): TileMapRenderState {
  const group = new THREE.Group();
  const tileGroup = new THREE.Group();
  const debugGroup = new THREE.Group();
  group.add(tileGroup);
  group.add(debugGroup);

  return {
    group,
    tileGroup,
    debugGroup,
    tileMeshes: new Map(),
    carvedChunkMeshes: new Map(),
    carvedChunkVersions: new Map(),
    debugVisible: false,
  };
}

/**
 * Build Three.js geometry for a tile polygon.
 * Polygon is in [0,1] local space, positioned at (cellX, cellY) in tilemap space.
 */
function createTileGeometry(
  polygon: Vec2[],
  cellX: number,
  cellY: number,
  tileSize: number,
): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  const first = polygon[0]!;
  shape.moveTo(cellX * tileSize + first.x * tileSize, cellY * tileSize + first.y * tileSize);
  for (let i = 1; i < polygon.length; i++) {
    const v = polygon[i]!;
    shape.lineTo(cellX * tileSize + v.x * tileSize, cellY * tileSize + v.y * tileSize);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/**
 * Render (or update) the tilemap.
 * Creates meshes for new tiles, removes meshes for deleted tiles.
 */
export function renderTileMap(
  state: TileMapRenderState,
  layer: TileMapLayer,
  tileSet: TileSet,
): void {
  const existingKeys = new Set(state.tileMeshes.keys());

  for (const [cellKey, cell] of layer.cells) {
    existingKeys.delete(cellKey);

    if (state.tileMeshes.has(cellKey)) continue; // already rendered

    const source = tileSet.sources.get(cell.sourceId);
    if (!source) continue;
    const tileData = source.tiles.get(cell.tileId);
    if (!tileData) continue;

    const { x, y } = unpackKey(cellKey);
    const geometry = createTileGeometry(tileData.polygon, x, y, tileSet.tileSize);
    const color = TILE_COLORS[cell.tileId % TILE_COLORS.length]!;
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);

    state.tileGroup.add(mesh);
    state.tileMeshes.set(cellKey, mesh);
  }

  // Remove deleted tiles
  for (const key of existingKeys) {
    const mesh = state.tileMeshes.get(key);
    if (mesh) {
      state.tileGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      state.tileMeshes.delete(key);
    }
  }
}

/**
 * Rebuild visual geometry for carved chunks using their density grids.
 *
 * For each dirty chunk that has a density grid, this function:
 *  1. Hides the original per-tile meshes that fall within the chunk.
 *  2. Creates a single merged mesh of small quads — one per solid cell
 *     in the density grid — giving a pixelated but correct visual
 *     representation of the carved terrain.
 *
 * Only re-renders a chunk when its physicsVersion has changed.
 */
export function renderCarvedChunks(
  state: TileMapRenderState,
  layer: TileMapLayer,
  tileSet: TileSet,
  chunks: ChunkMap,
): void {
  for (const [chunkKey, chunk] of chunks) {
    if (!chunk.densityGrid) continue;

    // Skip if already rendered at current version
    const renderedVersion = state.carvedChunkVersions.get(chunkKey);
    if (renderedVersion === chunk.physicsVersion) continue;

    // Remove previous carved mesh for this chunk
    const oldMesh = state.carvedChunkMeshes.get(chunkKey);
    if (oldMesh) {
      state.tileGroup.remove(oldMesh);
      oldMesh.geometry.dispose();
      (oldMesh.material as THREE.Material).dispose();
      state.carvedChunkMeshes.delete(chunkKey);
    }

    const ts = tileSet.tileSize;
    const resolution = chunk.gridResolution;
    const side = densityGridSide(layer.chunkSize, resolution);
    const cellCount = side - 1; // number of density cells per side
    const cellWorldSize = (layer.chunkSize * ts) / cellCount;
    const chunkWorldX = chunk.cx * layer.chunkSize * ts;
    const chunkWorldY = chunk.cy * layer.chunkSize * ts;

    // Hide original tile meshes that fall within this chunk
    for (let ty = 0; ty < layer.chunkSize; ty++) {
      for (let tx = 0; tx < layer.chunkSize; tx++) {
        const worldTileX = chunk.cx * layer.chunkSize + tx;
        const worldTileY = chunk.cy * layer.chunkSize + ty;
        const cellKey = packCellKey(worldTileX, worldTileY);
        const tileMesh = state.tileMeshes.get(cellKey);
        if (tileMesh) {
          tileMesh.visible = false;
        }
      }
    }

    // Count solid cells for buffer allocation
    let solidCount = 0;
    for (let cy = 0; cy < cellCount; cy++) {
      for (let cx = 0; cx < cellCount; cx++) {
        if (isCellSolid(chunk.densityGrid, side, cx, cy, 128)) {
          solidCount++;
        }
      }
    }

    if (solidCount === 0) {
      state.carvedChunkVersions.set(chunkKey, chunk.physicsVersion);
      continue;
    }

    // Build merged geometry: 2 triangles (6 vertices) per solid cell
    const positions = new Float32Array(solidCount * 6 * 3);
    let vi = 0;

    for (let cy = 0; cy < cellCount; cy++) {
      for (let cx = 0; cx < cellCount; cx++) {
        if (!isCellSolid(chunk.densityGrid, side, cx, cy, 128)) continue;

        const x0 = chunkWorldX + cx * cellWorldSize;
        const y0 = chunkWorldY + cy * cellWorldSize;
        const x1 = x0 + cellWorldSize;
        const y1 = y0 + cellWorldSize;

        // Triangle 1: bottom-left
        positions[vi++] = x0;
        positions[vi++] = y0;
        positions[vi++] = 0;
        positions[vi++] = x1;
        positions[vi++] = y0;
        positions[vi++] = 0;
        positions[vi++] = x1;
        positions[vi++] = y1;
        positions[vi++] = 0;

        // Triangle 2: top-right
        positions[vi++] = x0;
        positions[vi++] = y0;
        positions[vi++] = 0;
        positions[vi++] = x1;
        positions[vi++] = y1;
        positions[vi++] = 0;
        positions[vi++] = x0;
        positions[vi++] = y1;
        positions[vi++] = 0;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.MeshBasicMaterial({
      color: CARVED_TILE_COLOR,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);

    state.tileGroup.add(mesh);
    state.carvedChunkMeshes.set(chunkKey, mesh);
    state.carvedChunkVersions.set(chunkKey, chunk.physicsVersion);
  }
}

/**
 * Check if a marching-squares cell is considered solid.
 * A cell is solid when all four corner samples meet or exceed the threshold.
 */
function isCellSolid(
  grid: Uint8Array,
  side: number,
  cx: number,
  cy: number,
  threshold: number,
): boolean {
  const bl = grid[cy * side + cx]!;
  const br = grid[cy * side + cx + 1]!;
  const tl = grid[(cy + 1) * side + cx]!;
  const tr = grid[(cy + 1) * side + cx + 1]!;
  return bl >= threshold && br >= threshold && tl >= threshold && tr >= threshold;
}

/**
 * Render debug overlays: grid lines, chunk boundaries, collision edges.
 */
export function renderDebugOverlays(
  state: TileMapRenderState,
  layer: TileMapLayer,
  tileSet: TileSet,
  chunks: ChunkMap,
  gridExtent: number, // how many tiles to show grid for
): void {
  // Clear previous debug geometry
  while (state.debugGroup.children.length > 0) {
    const child = state.debugGroup.children[0]!;
    state.debugGroup.remove(child);
    if (child instanceof THREE.LineSegments || child instanceof THREE.Line) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  }

  if (!state.debugVisible) return;

  const ts = tileSet.tileSize;

  // Grid lines
  const gridPoints: number[] = [];
  for (let i = 0; i <= gridExtent; i++) {
    // Vertical
    gridPoints.push(i * ts, 0, 0.01, i * ts, gridExtent * ts, 0.01);
    // Horizontal
    gridPoints.push(0, i * ts, 0.01, gridExtent * ts, i * ts, 0.01);
  }
  const gridGeom = new THREE.BufferGeometry();
  gridGeom.setAttribute("position", new THREE.Float32BufferAttribute(gridPoints, 3));
  const gridLines = new THREE.LineSegments(
    gridGeom,
    new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.5 }),
  );
  state.debugGroup.add(gridLines);

  // Chunk boundaries
  const chunkPoints: number[] = [];
  const cs = layer.chunkSize * ts;
  const chunkExtent = Math.ceil(gridExtent / layer.chunkSize);
  for (let i = 0; i <= chunkExtent; i++) {
    chunkPoints.push(i * cs, 0, 0.02, i * cs, chunkExtent * cs, 0.02);
    chunkPoints.push(0, i * cs, 0.02, chunkExtent * cs, i * cs, 0.02);
  }
  const chunkGeom = new THREE.BufferGeometry();
  chunkGeom.setAttribute("position", new THREE.Float32BufferAttribute(chunkPoints, 3));
  const chunkLines = new THREE.LineSegments(
    chunkGeom,
    new THREE.LineBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 }),
  );
  state.debugGroup.add(chunkLines);

  // Collision edges from chunks
  for (const [, chunk] of chunks) {
    if (!chunk.collisionEdges) continue;
    const edgePoints: number[] = [];
    const offsetX = chunk.cx * layer.chunkSize * ts;
    const offsetY = chunk.cy * layer.chunkSize * ts;

    for (const seg of chunk.collisionEdges) {
      if (seg.length !== 2) continue;
      edgePoints.push(
        offsetX + seg[0]!.x * ts,
        offsetY + seg[0]!.y * ts,
        0.03,
        offsetX + seg[1]!.x * ts,
        offsetY + seg[1]!.y * ts,
        0.03,
      );
    }

    if (edgePoints.length > 0) {
      const edgeGeom = new THREE.BufferGeometry();
      edgeGeom.setAttribute("position", new THREE.Float32BufferAttribute(edgePoints, 3));
      const edgeLines = new THREE.LineSegments(
        edgeGeom,
        new THREE.LineBasicMaterial({ color: 0xff0000 }),
      );
      state.debugGroup.add(edgeLines);
    }
  }
}

function unpackKey(key: bigint): { x: number; y: number } {
  const uy = Number(key & 0xffffffffn);
  const ux = Number((key >> 32n) & 0xffffffffn);
  const x = ux > 0x7fffffff ? ux - 0x100000000 : ux;
  const y = uy > 0x7fffffff ? uy - 0x100000000 : uy;
  return { x, y };
}
