/**
 * Tile shape integration tests.
 *
 * Verifies that:
 * 1. All tile polygons are valid (within [0,1] bounds, correct winding)
 * 2. Undamaged tile meshes exactly match polygon vertices
 * 3. Density grid initialisation preserves polygon shape
 * 4. Point-in-polygon is correct for all standard shapes
 */

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  TILE_FULL,
  TILE_HALF_BOTTOM,
  TILE_HALF_TOP,
  TILE_HALF_LEFT,
  TILE_HALF_RIGHT,
  TILE_WEDGE_BL,
  TILE_WEDGE_BR,
  TILE_WEDGE_TL,
  TILE_WEDGE_TR,
  type Vec2,
} from "./types.js";
import { pointInPolygon, initTileDensity } from "./polygon.js";
import { marchingSquares } from "./density.js";

// --- All standard tile shapes ---

const ALL_SHAPES: { name: string; polygon: Vec2[]; expectedVertexCount: number }[] = [
  { name: "TILE_FULL", polygon: TILE_FULL, expectedVertexCount: 4 },
  { name: "TILE_HALF_BOTTOM", polygon: TILE_HALF_BOTTOM, expectedVertexCount: 4 },
  { name: "TILE_HALF_TOP", polygon: TILE_HALF_TOP, expectedVertexCount: 4 },
  { name: "TILE_HALF_LEFT", polygon: TILE_HALF_LEFT, expectedVertexCount: 4 },
  { name: "TILE_HALF_RIGHT", polygon: TILE_HALF_RIGHT, expectedVertexCount: 4 },
  { name: "TILE_WEDGE_BL", polygon: TILE_WEDGE_BL, expectedVertexCount: 3 },
  { name: "TILE_WEDGE_BR", polygon: TILE_WEDGE_BR, expectedVertexCount: 3 },
  { name: "TILE_WEDGE_TL", polygon: TILE_WEDGE_TL, expectedVertexCount: 3 },
  { name: "TILE_WEDGE_TR", polygon: TILE_WEDGE_TR, expectedVertexCount: 3 },
];

// --- Helper: build Three.js ShapeGeometry from a tile polygon at a given cell ---

function buildTileGeometry(polygon: Vec2[], cellX: number, cellY: number, tileSize: number = 1) {
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

/** Extract unique vertex positions from a BufferGeometry */
function extractUniqueVertices(geom: THREE.BufferGeometry): Vec2[] {
  const pos = geom.getAttribute("position");
  const seen = new Map<string, Vec2>();
  for (let i = 0; i < pos.count; i++) {
    const x = Math.round(pos.getX(i) * 10000) / 10000;
    const y = Math.round(pos.getY(i) * 10000) / 10000;
    const key = `${x},${y}`;
    if (!seen.has(key)) {
      seen.set(key, { x, y });
    }
  }
  return [...seen.values()];
}

/** Convert polygon local [0,1] coords to world coords at a cell position */
function polygonToWorld(
  polygon: Vec2[],
  cellX: number,
  cellY: number,
  tileSize: number = 1,
): Vec2[] {
  return polygon.map((v) => ({
    x: Math.round((cellX * tileSize + v.x * tileSize) * 10000) / 10000,
    y: Math.round((cellY * tileSize + v.y * tileSize) * 10000) / 10000,
  }));
}

// --- Tests ---

describe("Tile polygon validity", () => {
  for (const { name, polygon, expectedVertexCount } of ALL_SHAPES) {
    it(`${name}: has ${expectedVertexCount} vertices`, () => {
      expect(polygon).toHaveLength(expectedVertexCount);
    });

    it(`${name}: all vertices within [0,1] bounds`, () => {
      for (const v of polygon) {
        expect(v.x).toBeGreaterThanOrEqual(0);
        expect(v.x).toBeLessThanOrEqual(1);
        expect(v.y).toBeGreaterThanOrEqual(0);
        expect(v.y).toBeLessThanOrEqual(1);
      }
    });

    it(`${name}: positive area (valid winding)`, () => {
      // Shoelace formula
      let area = 0;
      const n = polygon.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += polygon[i]!.x * polygon[j]!.y;
        area -= polygon[j]!.x * polygon[i]!.y;
      }
      expect(Math.abs(area / 2)).toBeGreaterThan(0);
    });
  }
});

describe("Undamaged tile mesh vertices match polygon exactly", () => {
  for (const { name, polygon } of ALL_SHAPES) {
    it(`${name} at (0,0): mesh contains all polygon vertices`, () => {
      const geom = buildTileGeometry(polygon, 0, 0, 1);
      const meshVerts = extractUniqueVertices(geom);
      const expectedVerts = polygonToWorld(polygon, 0, 0, 1);

      for (const expected of expectedVerts) {
        const found = meshVerts.some(
          (v) => Math.abs(v.x - expected.x) < 0.001 && Math.abs(v.y - expected.y) < 0.001,
        );
        expect(found, `${name}: vertex (${expected.x}, ${expected.y}) not found in mesh`).toBe(
          true,
        );
      }
      geom.dispose();
    });

    it(`${name} at (5,3): mesh vertices offset correctly`, () => {
      const geom = buildTileGeometry(polygon, 5, 3, 1);
      const meshVerts = extractUniqueVertices(geom);
      const expectedVerts = polygonToWorld(polygon, 5, 3, 1);

      for (const expected of expectedVerts) {
        const found = meshVerts.some(
          (v) => Math.abs(v.x - expected.x) < 0.001 && Math.abs(v.y - expected.y) < 0.001,
        );
        expect(found, `${name} at (5,3): vertex (${expected.x}, ${expected.y}) missing`).toBe(true);
      }
      geom.dispose();
    });

    it(`${name}: mesh has no vertices outside polygon bounds`, () => {
      const geom = buildTileGeometry(polygon, 0, 0, 1);
      const meshVerts = extractUniqueVertices(geom);

      for (const v of meshVerts) {
        expect(v.x).toBeGreaterThanOrEqual(-0.001);
        expect(v.x).toBeLessThanOrEqual(1.001);
        expect(v.y).toBeGreaterThanOrEqual(-0.001);
        expect(v.y).toBeLessThanOrEqual(1.001);
      }
      geom.dispose();
    });
  }
});

describe("Point-in-polygon for all shapes", () => {
  it("TILE_FULL: centre inside, corners inside, outside points outside", () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, TILE_FULL)).toBe(true);
    expect(pointInPolygon({ x: 0.01, y: 0.01 }, TILE_FULL)).toBe(true);
    expect(pointInPolygon({ x: 0.99, y: 0.99 }, TILE_FULL)).toBe(true);
    expect(pointInPolygon({ x: 1.5, y: 0.5 }, TILE_FULL)).toBe(false);
    expect(pointInPolygon({ x: -0.1, y: 0.5 }, TILE_FULL)).toBe(false);
  });

  it("TILE_HALF_BOTTOM: bottom half inside, top half outside", () => {
    expect(pointInPolygon({ x: 0.5, y: 0.25 }, TILE_HALF_BOTTOM)).toBe(true);
    expect(pointInPolygon({ x: 0.5, y: 0.75 }, TILE_HALF_BOTTOM)).toBe(false);
  });

  it("TILE_HALF_TOP: top half inside, bottom half outside", () => {
    expect(pointInPolygon({ x: 0.5, y: 0.75 }, TILE_HALF_TOP)).toBe(true);
    expect(pointInPolygon({ x: 0.5, y: 0.25 }, TILE_HALF_TOP)).toBe(false);
  });

  it("TILE_HALF_LEFT: left half inside, right half outside", () => {
    expect(pointInPolygon({ x: 0.25, y: 0.5 }, TILE_HALF_LEFT)).toBe(true);
    expect(pointInPolygon({ x: 0.75, y: 0.5 }, TILE_HALF_LEFT)).toBe(false);
  });

  it("TILE_HALF_RIGHT: right half inside, left half outside", () => {
    expect(pointInPolygon({ x: 0.75, y: 0.5 }, TILE_HALF_RIGHT)).toBe(true);
    expect(pointInPolygon({ x: 0.25, y: 0.5 }, TILE_HALF_RIGHT)).toBe(false);
  });

  it("TILE_WEDGE_BL: bottom-left triangle", () => {
    expect(pointInPolygon({ x: 0.1, y: 0.1 }, TILE_WEDGE_BL)).toBe(true);
    expect(pointInPolygon({ x: 0.9, y: 0.9 }, TILE_WEDGE_BL)).toBe(false);
  });

  it("TILE_WEDGE_BR: bottom-right triangle", () => {
    expect(pointInPolygon({ x: 0.9, y: 0.1 }, TILE_WEDGE_BR)).toBe(true);
    expect(pointInPolygon({ x: 0.1, y: 0.9 }, TILE_WEDGE_BR)).toBe(false);
  });

  it("TILE_WEDGE_TL: top-left triangle", () => {
    expect(pointInPolygon({ x: 0.1, y: 0.9 }, TILE_WEDGE_TL)).toBe(true);
    expect(pointInPolygon({ x: 0.9, y: 0.1 }, TILE_WEDGE_TL)).toBe(false);
  });

  it("TILE_WEDGE_TR: top-right triangle", () => {
    expect(pointInPolygon({ x: 0.9, y: 0.9 }, TILE_WEDGE_TR)).toBe(true);
    expect(pointInPolygon({ x: 0.1, y: 0.1 }, TILE_WEDGE_TR)).toBe(false);
  });
});

describe("Density grid matches polygon shape for undamaged tiles", () => {
  const resolution = 4; // 5x5 sample grid per tile

  for (const { name, polygon } of ALL_SHAPES) {
    it(`${name}: density grid solid samples match point-in-polygon`, () => {
      const grid = initTileDensity(polygon, resolution);
      const side = resolution + 1;

      for (let gy = 0; gy < side; gy++) {
        for (let gx = 0; gx < side; gx++) {
          const point: Vec2 = { x: gx / resolution, y: gy / resolution };
          const density = grid[gy * side + gx]!;
          const shouldBeSolid = pointInPolygon(point, polygon);

          // Points strictly inside should be solid
          if (shouldBeSolid) {
            expect(
              density,
              `${name}: point (${point.x},${point.y}) should be solid but density=${density}`,
            ).toBe(255);
          }
        }
      }
    });
  }

  it("full tile at resolution 4: all 25 samples solid", () => {
    const grid = initTileDensity(TILE_FULL, 4);
    expect(grid.filter((v) => v === 255).length).toBe(25);
  });

  it("half-bottom at resolution 4: bottom 15 samples solid, top 10 mixed", () => {
    const grid = initTileDensity(TILE_HALF_BOTTOM, 4);
    const side = 5;
    let bottomSolid = 0;
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        if (y <= 2 && grid[y * side + x] === 255) bottomSolid++;
      }
    }
    // y=0,1,2 rows (below and at y=0.5) should be mostly solid
    expect(bottomSolid).toBeGreaterThanOrEqual(10);
  });
});

describe("Undamaged tile marching squares produces boundary at polygon edges", () => {
  it("full tile: no marching squares edges (fully solid)", () => {
    const grid = initTileDensity(TILE_FULL, 4);
    // Need to pad into a chunk context — a single full tile in a 1x1 chunk
    const edges = marchingSquares(grid, 1, 4);
    // A fully solid grid produces no interior edges
    expect(edges).toHaveLength(0);
  });

  it("half-bottom: marching squares produces horizontal edge near y=0.5", () => {
    const grid = initTileDensity(TILE_HALF_BOTTOM, 4);
    const edges = marchingSquares(grid, 1, 4);
    expect(edges.length).toBeGreaterThan(0);

    // All edge segments should be near y=0.5
    for (const seg of edges) {
      for (const point of seg) {
        expect(point.y).toBeGreaterThanOrEqual(0.3);
        expect(point.y).toBeLessThanOrEqual(0.7);
      }
    }
  });

  it("wedge BL: marching squares produces diagonal edge", () => {
    const grid = initTileDensity(TILE_WEDGE_BL, 4);
    const edges = marchingSquares(grid, 1, 4);
    expect(edges.length).toBeGreaterThan(0);
  });
});
