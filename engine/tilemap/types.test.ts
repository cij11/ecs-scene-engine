import { describe, it, expect } from "vitest";
import {
  createTileSet,
  createTileSetSource,
  createTileData,
  createTileMapLayer,
  createChunk,
  packCellKey,
  unpackCellKey,
  cellToWorld,
  cellCentre,
  worldToCell,
  cellToChunk,
  TILE_FULL,
  TILE_TRIANGLE_BL,
  TILE_HALF_BOTTOM,
} from "./types.js";

describe("TileSet types", () => {
  it("creates a TileSet with sources and tiles", () => {
    const tileSet = createTileSet(1);
    const source = createTileSetSource(0);
    source.tiles.set(0, createTileData(TILE_FULL));
    source.tiles.set(1, createTileData(TILE_TRIANGLE_BL));
    source.tiles.set(2, createTileData(TILE_HALF_BOTTOM));
    tileSet.sources.set(0, source);

    expect(tileSet.sources.size).toBe(1);
    expect(source.tiles.size).toBe(3);
    expect(source.tiles.get(0)!.polygon).toEqual(TILE_FULL);
    expect(source.tiles.get(1)!.polygon).toHaveLength(3);
  });

  it("TileData defaults physics polygon to visual polygon", () => {
    const td = createTileData(TILE_TRIANGLE_BL);
    expect(td.physicsPolygons).toEqual([TILE_TRIANGLE_BL]);
  });
});

describe("TileMapLayer", () => {
  it("stores cells sparsely", () => {
    const layer = createTileMapLayer(0);
    const key = packCellKey(5, 10);
    layer.cells.set(key, { sourceId: 0, tileId: 0, alternativeId: 0 });

    expect(layer.cells.size).toBe(1);
    expect(layer.cells.has(packCellKey(0, 0))).toBe(false);
    expect(layer.cells.has(key)).toBe(true);
  });

  it("packs and unpacks cell keys correctly", () => {
    const cases = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 100, y: 200 },
      { x: -1, y: -1 },
      { x: -50, y: 30 },
    ];
    for (const { x, y } of cases) {
      const key = packCellKey(x, y);
      const result = unpackCellKey(key);
      expect(result.x).toBe(x);
      expect(result.y).toBe(y);
    }
  });
});

describe("Coordinate helpers", () => {
  it("cellToWorld: lower-left corner of cell", () => {
    expect(cellToWorld(0, 0)).toEqual({ x: 0, y: 0 });
    expect(cellToWorld(3, 2)).toEqual({ x: 3, y: 2 });
    expect(cellToWorld(0, 0, 2)).toEqual({ x: 0, y: 0 });
    expect(cellToWorld(1, 1, 2)).toEqual({ x: 2, y: 2 });
  });

  it("cellCentre: (0,0) cell centre at (0.5, 0.5)", () => {
    expect(cellCentre(0, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(cellCentre(1, 0)).toEqual({ x: 1.5, y: 0.5 });
    expect(cellCentre(0, 0, 2)).toEqual({ x: 1, y: 1 });
  });

  it("worldToCell: floors to cell grid", () => {
    expect(worldToCell(0.5, 0.5)).toEqual({ x: 0, y: 0 });
    expect(worldToCell(1.0, 0.0)).toEqual({ x: 1, y: 0 });
    expect(worldToCell(0.99, 0.99)).toEqual({ x: 0, y: 0 });
    expect(worldToCell(2.5, 3.7)).toEqual({ x: 2, y: 3 });
  });

  it("worldToCell with tileSize 2", () => {
    expect(worldToCell(1.0, 1.0, 2)).toEqual({ x: 0, y: 0 });
    expect(worldToCell(2.0, 2.0, 2)).toEqual({ x: 1, y: 1 });
  });

  it("cellToChunk: maps cell to chunk", () => {
    expect(cellToChunk(0, 0, 32)).toEqual({ cx: 0, cy: 0 });
    expect(cellToChunk(31, 31, 32)).toEqual({ cx: 0, cy: 0 });
    expect(cellToChunk(32, 0, 32)).toEqual({ cx: 1, cy: 0 });
    expect(cellToChunk(63, 63, 32)).toEqual({ cx: 1, cy: 1 });
  });
});

describe("Chunk", () => {
  it("creates with null density grid", () => {
    const chunk = createChunk(0, 0);
    expect(chunk.densityGrid).toBeNull();
    expect(chunk.dirty).toBe(false);
    expect(chunk.gridResolution).toBe(2);
  });
});
