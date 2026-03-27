import { describe, it, expect } from "vitest";
import {
  clearGridWgsl,
  populateGridWgsl,
  collisionWgsl,
  integrateWgsl,
  GRID_SIZE,
  MAX_PER_CELL,
  TOTAL_CELLS,
} from "./physics.js";

describe("physics WGSL shaders", () => {
  it("clearGrid references grid and params", () => {
    expect(clearGridWgsl).toContain("var<storage, read_write> grid");
    expect(clearGridWgsl).toContain("var<uniform> params");
    expect(clearGridWgsl).toContain("grid[cellBase + i] = -1");
  });

  it("populateGrid uses spatial hash with atomic insert", () => {
    expect(populateGridWgsl).toContain("atomicCompareExchangeWeak");
    expect(populateGridWgsl).toContain("var<storage, read> px");
    expect(populateGridWgsl).toContain("var<storage, read> py");
    expect(populateGridWgsl).toContain("var<storage, read> pz");
    expect(populateGridWgsl).toContain("gridIndex(gx, gy, gz)");
  });

  it("collision checks 27 neighboring cells", () => {
    expect(collisionWgsl).toContain("dx = -1; dx <= 1");
    expect(collisionWgsl).toContain("dy = -1; dy <= 1");
    expect(collisionWgsl).toContain("dz = -1; dz <= 1");
  });

  it("collision computes sphere-sphere overlap and impulse", () => {
    expect(collisionWgsl).toContain("let diff = posA - posB");
    expect(collisionWgsl).toContain("let dist = length(diff)");
    expect(collisionWgsl).toContain("let minDist = radA + radB");
    expect(collisionWgsl).toContain("let normal = diff / dist");
    expect(collisionWgsl).toContain("restitution[eid]");
  });

  it("collision writes to velocity and position (separation push)", () => {
    expect(collisionWgsl).toContain("var<storage, read_write> vx");
    expect(collisionWgsl).toContain("var<storage, read_write> px");
    expect(collisionWgsl).toContain("vx[eid] = vx[eid] + j * normal.x");
    expect(collisionWgsl).toContain("px[eid] = px[eid] + normal.x * overlap");
  });

  it("integrate applies forces, gravity, and clears forces", () => {
    expect(integrateWgsl).toContain("vx[eid] = vx[eid] + fx[eid] * params.dt");
    expect(integrateWgsl).toContain("fy[eid] + params.gravity");
    expect(integrateWgsl).toContain("fx[eid] = 0.0");
    expect(integrateWgsl).toContain("fy[eid] = 0.0");
    expect(integrateWgsl).toContain("fz[eid] = 0.0");
  });

  it("integrate has bounds clamping with dampening", () => {
    expect(integrateWgsl).toContain("params.boundsMin");
    expect(integrateWgsl).toContain("params.boundsMax");
    expect(integrateWgsl).toContain("dampening");
  });

  it("integrate reads and writes position and velocity", () => {
    expect(integrateWgsl).toContain("var<storage, read_write> px");
    expect(integrateWgsl).toContain("var<storage, read_write> vx");
    expect(integrateWgsl).toContain("px[eid] = px[eid] + vx[eid] * params.dt");
  });
});

describe("physics constants", () => {
  it("GRID_SIZE is 64", () => {
    expect(GRID_SIZE).toBe(64);
  });

  it("MAX_PER_CELL is 4", () => {
    expect(MAX_PER_CELL).toBe(4);
  });

  it("TOTAL_CELLS is GRID_SIZE^3", () => {
    expect(TOTAL_CELLS).toBe(64 * 64 * 64);
  });
});
