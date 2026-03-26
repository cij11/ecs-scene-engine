import { describe, it, expect } from "vitest";
import { combineTransforms } from "./transform-propagation.js";

describe("combineTransforms", () => {
  it("adds parent position to local position (no rotation)", () => {
    const parent = { px: 100, py: 50, pz: 0, rx: 0, ry: 0, rz: 0, rw: 1, sx: 1, sy: 1, sz: 1 };
    const local = { px: 5, py: 3, pz: 0, rx: 0, ry: 0, rz: 0, rw: 1, sx: 1, sy: 1, sz: 1 };

    const result = combineTransforms(parent, local);

    expect(result.px).toBeCloseTo(105);
    expect(result.py).toBeCloseTo(53);
    expect(result.pz).toBeCloseTo(0);
  });

  it("rotates local position by parent rotation", () => {
    // Parent rotated 90 degrees around Y axis
    const angle = Math.PI / 2;
    const parent = {
      px: 0, py: 0, pz: 0,
      rx: 0, ry: Math.sin(angle / 2), rz: 0, rw: Math.cos(angle / 2),
      sx: 1, sy: 1, sz: 1,
    };
    const local = { px: 1, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, rw: 1, sx: 1, sy: 1, sz: 1 };

    const result = combineTransforms(parent, local);

    // (1,0,0) rotated 90° around Y → (0,0,-1)
    expect(result.px).toBeCloseTo(0);
    expect(result.py).toBeCloseTo(0);
    expect(result.pz).toBeCloseTo(-1);
  });

  it("combines parent position and rotation", () => {
    // Parent at (10, 0, 0) rotated 90° around Y
    const angle = Math.PI / 2;
    const parent = {
      px: 10, py: 0, pz: 0,
      rx: 0, ry: Math.sin(angle / 2), rz: 0, rw: Math.cos(angle / 2),
      sx: 1, sy: 1, sz: 1,
    };
    // Local at (5, 0, 0)
    const local = { px: 5, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, rw: 1, sx: 1, sy: 1, sz: 1 };

    const result = combineTransforms(parent, local);

    // (5,0,0) rotated 90° around Y → (0,0,-5), then + parent (10,0,0)
    expect(result.px).toBeCloseTo(10);
    expect(result.py).toBeCloseTo(0);
    expect(result.pz).toBeCloseTo(-5);
  });

  it("multiplies scales", () => {
    const parent = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, rw: 1, sx: 2, sy: 3, sz: 1 };
    const local = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, rw: 1, sx: 0.5, sy: 0.5, sz: 1 };

    const result = combineTransforms(parent, local);

    expect(result.sx).toBeCloseTo(1);
    expect(result.sy).toBeCloseTo(1.5);
    expect(result.sz).toBeCloseTo(1);
  });

  it("multiplies quaternion rotations", () => {
    // Both rotate 90° around Y → combined = 180°
    const angle = Math.PI / 2;
    const q = { rx: 0, ry: Math.sin(angle / 2), rz: 0, rw: Math.cos(angle / 2) };

    const parent = { px: 0, py: 0, pz: 0, ...q, sx: 1, sy: 1, sz: 1 };
    const local = { px: 1, py: 0, pz: 0, ...q, sx: 1, sy: 1, sz: 1 };

    const result = combineTransforms(parent, local);

    // Local (1,0,0) rotated 90° by parent → (0,0,-1)
    expect(result.px).toBeCloseTo(0);
    expect(result.pz).toBeCloseTo(-1);

    // Combined rotation should be 180° around Y
    // sin(180/2) = 1, cos(180/2) = 0
    expect(result.ry).toBeCloseTo(1);
    expect(result.rw).toBeCloseTo(0, 5);
  });

  it("identity parent passes through local unchanged", () => {
    const parent = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, rw: 1, sx: 1, sy: 1, sz: 1 };
    const local = { px: 7, py: 3, pz: -2, rx: 0.1, ry: 0.2, rz: 0.3, rw: 0.9, sx: 2, sy: 2, sz: 2 };

    const result = combineTransforms(parent, local);

    expect(result.px).toBeCloseTo(7);
    expect(result.py).toBeCloseTo(3);
    expect(result.pz).toBeCloseTo(-2);
    expect(result.rx).toBeCloseTo(0.1);
    expect(result.ry).toBeCloseTo(0.2);
    expect(result.rz).toBeCloseTo(0.3);
    expect(result.rw).toBeCloseTo(0.9);
    expect(result.sx).toBeCloseTo(2);
    expect(result.sy).toBeCloseTo(2);
    expect(result.sz).toBeCloseTo(2);
  });
});
