import { describe, it, expect } from "vitest";
import {
  allocateDensityGrid,
  fillDensityGrid,
  densityGridSide,
  marchingSquares,
} from "./density.js";

describe("DensityGrid", () => {
  it("allocates correct size", () => {
    // 4 tiles, resolution 2 → side = 4*2+1 = 9, total = 81
    const grid = allocateDensityGrid(4, 2);
    expect(grid.length).toBe(81);
  });

  it("fills with solid", () => {
    const grid = allocateDensityGrid(2, 2);
    fillDensityGrid(grid, 255);
    expect(grid.every((v) => v === 255)).toBe(true);
  });

  it("fills with empty", () => {
    const grid = allocateDensityGrid(2, 2);
    fillDensityGrid(grid, 0);
    expect(grid.every((v) => v === 0)).toBe(true);
  });

  it("densityGridSide returns correct value", () => {
    expect(densityGridSide(4, 2)).toBe(9);
    expect(densityGridSide(32, 2)).toBe(65);
    expect(densityGridSide(4, 4)).toBe(17);
  });
});

describe("marchingSquares", () => {
  it("fully solid grid produces no edges", () => {
    const grid = allocateDensityGrid(4, 2);
    fillDensityGrid(grid, 255);
    const edges = marchingSquares(grid, 4, 2);
    expect(edges).toHaveLength(0);
  });

  it("fully empty grid produces no edges", () => {
    const grid = allocateDensityGrid(4, 2);
    fillDensityGrid(grid, 0);
    const edges = marchingSquares(grid, 4, 2);
    expect(edges).toHaveLength(0);
  });

  it("single empty cell in solid grid produces edges", () => {
    // 4x4 tiles, resolution 2 → 8x8 cells, side=9 samples
    const chunkSize = 4;
    const resolution = 2;
    const side = densityGridSide(chunkSize, resolution);
    const grid = allocateDensityGrid(chunkSize, resolution);
    fillDensityGrid(grid, 255);

    // Clear a single sample point in the interior (at grid position 4,4)
    grid[4 * side + 4] = 0;

    const edges = marchingSquares(grid, chunkSize, resolution);
    // Should produce edges around the empty point
    expect(edges.length).toBeGreaterThan(0);
    // Each edge should be a pair of Vec2
    for (const seg of edges) {
      expect(seg).toHaveLength(2);
      expect(seg[0]).toHaveProperty("x");
      expect(seg[0]).toHaveProperty("y");
    }
  });

  it("half-empty grid produces straight horizontal edge", () => {
    // 2x2 tiles, resolution 1 → 2x2 cells, side=3 samples
    const chunkSize = 2;
    const resolution = 1;
    const side = densityGridSide(chunkSize, resolution);
    const grid = allocateDensityGrid(chunkSize, resolution);

    // Bottom row solid, top row empty
    // y=0: solid, y=1: threshold, y=2: empty
    for (let x = 0; x < side; x++) {
      grid[0 * side + x] = 255; // y=0
      grid[1 * side + x] = 128; // y=1 (at threshold)
      grid[2 * side + x] = 0; // y=2
    }

    const edges = marchingSquares(grid, chunkSize, resolution);
    // Should produce horizontal edges at the transition
    expect(edges.length).toBeGreaterThan(0);

    // All edge y-coordinates should be near y=1 (in grid space = 1.0 in world space)
    for (const seg of edges) {
      for (const point of seg) {
        // Points should be between y=0.5 and y=1.5 (near the transition)
        expect(point.y).toBeGreaterThanOrEqual(0.5);
        expect(point.y).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it("edges are in world coordinates (0 to chunkSize)", () => {
    const chunkSize = 4;
    const resolution = 2;
    const side = densityGridSide(chunkSize, resolution);
    const grid = allocateDensityGrid(chunkSize, resolution);
    fillDensityGrid(grid, 255);

    // Clear a corner
    grid[0] = 0;

    const edges = marchingSquares(grid, chunkSize, resolution);
    expect(edges.length).toBeGreaterThan(0);

    for (const seg of edges) {
      for (const point of seg) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(chunkSize);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(chunkSize);
      }
    }
  });

  it("L-shaped void produces multiple edge segments", () => {
    const chunkSize = 4;
    const resolution = 2;
    const side = densityGridSide(chunkSize, resolution);
    const grid = allocateDensityGrid(chunkSize, resolution);
    fillDensityGrid(grid, 255);

    // Create an L-shaped void in the top-left
    for (let y = 5; y < side; y++) {
      for (let x = 0; x < 4; x++) {
        grid[y * side + x] = 0;
      }
    }
    for (let y = 7; y < side; y++) {
      for (let x = 4; x < 7; x++) {
        grid[y * side + x] = 0;
      }
    }

    const edges = marchingSquares(grid, chunkSize, resolution);
    // L-shape should produce more edges than a simple rectangle
    expect(edges.length).toBeGreaterThan(4);
  });
});
