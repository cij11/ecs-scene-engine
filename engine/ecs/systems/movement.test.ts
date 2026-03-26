import { describe, it, expect, beforeEach } from "vitest";
import { movementSystem } from "./movement.js";
import { Transform } from "../components/transform.js";
import { Velocity } from "../components/velocity.js";
import { resetComponentIdCounter } from "../component.js";
import {
  createWorld,
  addEntity,
  addComponent,
  getComponent,
  addSystem,
  tick,
} from "../world.js";

beforeEach(() => {
  resetComponentIdCounter();
});

describe("movementSystem", () => {
  it("applies velocity to transform", () => {
    const world = createWorld();
    const e = addEntity(world);

    addComponent(world, e, Transform, {
      px: 0, py: 0, pz: 0,
      rx: 0, ry: 0, rz: 0, rw: 1,
      sx: 1, sy: 1, sz: 1,
    });
    addComponent(world, e, Velocity, { vx: 10, vy: 5, vz: -3 });

    movementSystem(world, 1);

    const t = getComponent(world, Transform, e)!;
    expect(t.px).toBeCloseTo(10);
    expect(t.py).toBeCloseTo(5);
    expect(t.pz).toBeCloseTo(-3);
  });

  it("scales by delta time", () => {
    const world = createWorld();
    const e = addEntity(world);

    addComponent(world, e, Transform, {
      px: 0, py: 0, pz: 0,
      rx: 0, ry: 0, rz: 0, rw: 1,
      sx: 1, sy: 1, sz: 1,
    });
    addComponent(world, e, Velocity, { vx: 100, vy: 0, vz: 0 });

    movementSystem(world, 0.016);

    const t = getComponent(world, Transform, e)!;
    expect(t.px).toBeCloseTo(1.6);
  });

  it("works in the pipeline", () => {
    const world = createWorld();
    const e = addEntity(world);

    addComponent(world, e, Transform, {
      px: 5, py: 0, pz: 0,
      rx: 0, ry: 0, rz: 0, rw: 1,
      sx: 1, sy: 1, sz: 1,
    });
    addComponent(world, e, Velocity, { vx: 10, vy: 0, vz: 0 });

    addSystem(world, "update", movementSystem);

    tick(world, 1);
    expect(getComponent(world, Transform, e)!.px).toBeCloseTo(15);

    tick(world, 1);
    expect(getComponent(world, Transform, e)!.px).toBeCloseTo(25);
  });

  it("moves multiple entities independently", () => {
    const world = createWorld();

    const e1 = addEntity(world);
    addComponent(world, e1, Transform, {
      px: 0, py: 0, pz: 0,
      rx: 0, ry: 0, rz: 0, rw: 1,
      sx: 1, sy: 1, sz: 1,
    });
    addComponent(world, e1, Velocity, { vx: 1, vy: 0, vz: 0 });

    const e2 = addEntity(world);
    addComponent(world, e2, Transform, {
      px: 0, py: 0, pz: 0,
      rx: 0, ry: 0, rz: 0, rw: 1,
      sx: 1, sy: 1, sz: 1,
    });
    addComponent(world, e2, Velocity, { vx: 0, vy: 0, vz: -5 });

    movementSystem(world, 1);

    expect(getComponent(world, Transform, e1)!.px).toBeCloseTo(1);
    expect(getComponent(world, Transform, e2)!.pz).toBeCloseTo(-5);
  });
});
