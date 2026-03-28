import { describe, it, expect } from "vitest";
import { pointInPolygon, initTileDensity, initChunkDensity } from "./polygon.js";
import { TILE_FULL, TILE_TRIANGLE_BL, TILE_HALF_BOTTOM, TILE_HALF_LEFT } from "./types.js";

describe("pointInPolygon", () => {
  it("centre of unit square is inside", () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, TILE_FULL)).toBe(true);
  });

  it("point outside unit square", () => {
    expect(pointInPolygon({ x: 1.5, y: 0.5 }, TILE_FULL)).toBe(false);
    expect(pointInPolygon({ x: -0.1, y: 0.5 }, TILE_FULL)).toBe(false);
  });

  it("point inside bottom-left triangle", () => {
    expect(pointInPolygon({ x: 0.2, y: 0.2 }, TILE_TRIANGLE_BL)).toBe(true);
  });

  it("point outside bottom-left triangle", () => {
    expect(pointInPolygon({ x: 0.8, y: 0.8 }, TILE_TRIANGLE_BL)).toBe(false);
  });

  it("point inside bottom half", () => {
    expect(pointInPolygon({ x: 0.5, y: 0.25 }, TILE_HALF_BOTTOM)).toBe(true);
  });

  it("point outside bottom half (in top half)", () => {
    expect(pointInPolygon({ x: 0.5, y: 0.75 }, TILE_HALF_BOTTOM)).toBe(false);
  });
});

describe("initTileDensity", () => {
  it("full square tile: all samples solid", () => {
    const grid = initTileDensity(TILE_FULL, 2);
    // 3x3 = 9 samples, all should be 255
    expect(grid.length).toBe(9);
    expect(grid.every((v) => v === 255)).toBe(true);
  });

  it("bottom-left triangle: partial fill", () => {
    const grid = initTileDensity(TILE_TRIANGLE_BL, 4);
    // 5x5 = 25 samples
    expect(grid.length).toBe(25);
    const solidCount = grid.filter((v) => v === 255).length;
    // Triangle covers roughly half the tile, plus edge samples
    expect(solidCount).toBeGreaterThan(5);
    expect(solidCount).toBeLessThan(25);
  });

  it("half-bottom tile: bottom half solid", () => {
    const grid = initTileDensity(TILE_HALF_BOTTOM, 4);
    const side = 5;
    // Bottom rows (y=0,1,2) should be mostly solid, top rows (y=3,4) mostly empty
    let bottomSolid = 0;
    let topSolid = 0;
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        if (grid[y * side + x] === 255) {
          if (y <= 2) bottomSolid++;
          else topSolid++;
        }
      }
    }
    expect(bottomSolid).toBeGreaterThan(topSolid);
  });

  it("half-left tile: left half solid", () => {
    const grid = initTileDensity(TILE_HALF_LEFT, 4);
    const side = 5;
    let leftSolid = 0;
    let rightSolid = 0;
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        if (grid[y * side + x] === 255) {
          if (x <= 2) leftSolid++;
          else rightSolid++;
        }
      }
    }
    expect(leftSolid).toBeGreaterThan(rightSolid);
  });
});

describe("initChunkDensity", () => {
  it("chunk of full tiles: all samples solid", () => {
    const grid = initChunkDensity(2, 2, () => TILE_FULL);
    // side = 2*2+1 = 5, total = 25
    expect(grid.length).toBe(25);
    expect(grid.every((v) => v === 255)).toBe(true);
  });

  it("chunk with no tiles: all empty", () => {
    const grid = initChunkDensity(2, 2, () => null);
    expect(grid.every((v) => v === 0)).toBe(true);
  });

  it("chunk with mixed tiles", () => {
    const grid = initChunkDensity(2, 2, (tx, ty) => {
      if (tx === 0 && ty === 0) return TILE_FULL;
      if (tx === 1 && ty === 0) return TILE_TRIANGLE_BL;
      return null;
    });
    // Bottom-left tile fully solid, bottom-right partially, top empty
    const solidCount = grid.filter((v) => v === 255).length;
    expect(solidCount).toBeGreaterThan(0);
    expect(solidCount).toBeLessThan(grid.length);
  });
});
