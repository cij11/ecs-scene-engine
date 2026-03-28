import { describe, it, expect } from "vitest";
import {
  createTileSet,
  createTileSetSource,
  createTileData,
  createTileMapLayer,
  packCellKey,
  TILE_FULL,
  TILE_TRIANGLE_BL,
} from "./types.js";
import type { ChunkMap } from "./carve.js";
import { carve } from "./carve.js";
import { densityGridSide } from "./density.js";

function setupFullTileLayer(size: number) {
  const tileSet = createTileSet(1);
  const source = createTileSetSource(0);
  source.tiles.set(0, createTileData(TILE_FULL));
  source.tiles.set(1, createTileData(TILE_TRIANGLE_BL));
  tileSet.sources.set(0, source);

  const layer = createTileMapLayer(0, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      layer.cells.set(packCellKey(x, y), { sourceId: 0, tileId: 0, alternativeId: 0 });
    }
  }

  const chunks: ChunkMap = new Map();
  return { tileSet, layer, chunks };
}

describe("carve", () => {
  it("initialises density grid on first carve", () => {
    const { tileSet, layer, chunks } = setupFullTileLayer(4);

    carve(layer, tileSet, chunks, {
      type: "circle",
      position: { x: 2, y: 2 },
      radius: 0.5,
    });

    expect(chunks.size).toBe(1);
    const chunk = chunks.values().next().value!;
    expect(chunk.densityGrid).not.toBeNull();
    expect(chunk.dirty).toBe(true);
  });

  it("circle carve zeroes density within radius", () => {
    const { tileSet, layer, chunks } = setupFullTileLayer(4);
    const resolution = 2;

    carve(
      layer,
      tileSet,
      chunks,
      { type: "circle", position: { x: 2, y: 2 }, radius: 1 },
      resolution,
    );

    const chunk = chunks.values().next().value!;
    const side = densityGridSide(4, resolution);

    // Centre of grid should be zeroed
    const centreGx = 2 * resolution; // grid x for world x=2
    const centreGy = 2 * resolution;
    expect(chunk.densityGrid![centreGy * side + centreGx]).toBe(0);

    // Corner should still be solid
    expect(chunk.densityGrid![0]).toBe(255);
  });

  it("produces collision edges after carving", () => {
    const { tileSet, layer, chunks } = setupFullTileLayer(4);

    carve(layer, tileSet, chunks, {
      type: "circle",
      position: { x: 2, y: 2 },
      radius: 1,
    });

    const chunk = chunks.values().next().value!;
    expect(chunk.collisionEdges).not.toBeNull();
    expect(chunk.collisionEdges!.length).toBeGreaterThan(0);
  });

  it("multiple carves accumulate", () => {
    const { tileSet, layer, chunks } = setupFullTileLayer(4);

    carve(layer, tileSet, chunks, {
      type: "circle",
      position: { x: 1, y: 1 },
      radius: 0.5,
    });

    const chunk = chunks.values().next().value!;
    const edgesAfterFirst = chunk.collisionEdges!.length;

    carve(layer, tileSet, chunks, {
      type: "circle",
      position: { x: 3, y: 3 },
      radius: 0.5,
    });

    // More edges after second carve (two separate voids)
    expect(chunk.collisionEdges!.length).toBeGreaterThan(edgesAfterFirst);
  });

  it("physics version increments on each carve", () => {
    const { tileSet, layer, chunks } = setupFullTileLayer(4);

    carve(layer, tileSet, chunks, {
      type: "circle",
      position: { x: 2, y: 2 },
      radius: 0.5,
    });

    const chunk = chunks.values().next().value!;
    expect(chunk.physicsVersion).toBe(1);

    carve(layer, tileSet, chunks, {
      type: "circle",
      position: { x: 1, y: 1 },
      radius: 0.5,
    });

    expect(chunk.physicsVersion).toBe(2);
  });

  it("polygon carve works", () => {
    const { tileSet, layer, chunks } = setupFullTileLayer(4);

    carve(layer, tileSet, chunks, {
      type: "polygon",
      position: { x: 2, y: 2 },
      polygon: [
        { x: -0.5, y: -0.5 },
        { x: 0.5, y: -0.5 },
        { x: 0.5, y: 0.5 },
        { x: -0.5, y: 0.5 },
      ],
    });

    const chunk = chunks.values().next().value!;
    expect(chunk.collisionEdges!.length).toBeGreaterThan(0);
  });
});
