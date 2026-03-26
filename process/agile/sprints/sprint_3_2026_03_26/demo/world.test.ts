import { describe, it, expect, beforeEach } from "vitest";
import {
  createWorld,
  destroyWorld,
  addEntity,
  removeEntity,
  hasEntity,
  addComponent,
  removeComponent,
  hasComponent,
  getComponent,
  getStore,
  query,
  queryResults,
  addSystem,
  tick,
  Not,
} from "./world.js";
import { defineComponent, defineTag, resetComponentIdCounter } from "./component.js";
import { getIndex } from "./entity.js";
import { queryEntities } from "./query.js";

beforeEach(() => {
  resetComponentIdCounter();
});

describe("World - entities", () => {
  it("creates and tracks entities", () => {
    const world = createWorld();
    const e1 = addEntity(world);
    const e2 = addEntity(world);

    expect(hasEntity(world, e1)).toBe(true);
    expect(hasEntity(world, e2)).toBe(true);
  });

  it("removes entities", () => {
    const world = createWorld();
    const e1 = addEntity(world);

    expect(removeEntity(world, e1)).toBe(true);
    expect(hasEntity(world, e1)).toBe(false);
  });

  it("returns false removing non-existent entity", () => {
    const world = createWorld();
    expect(removeEntity(world, 99999)).toBe(false);
  });
});

describe("World - components", () => {
  it("adds and reads component data", () => {
    const Position = defineComponent({ x: Float32Array, y: Float32Array });
    const world = createWorld();
    const e = addEntity(world);

    addComponent(world, e, Position, { x: 10, y: 20 });

    expect(hasComponent(world, e, Position)).toBe(true);
    expect(getComponent(world, Position, e)).toEqual({ x: 10, y: 20 });
  });

  it("removes components", () => {
    const Position = defineComponent({ x: Float32Array });
    const world = createWorld();
    const e = addEntity(world);

    addComponent(world, e, Position, { x: 5 });
    removeComponent(world, e, Position);

    expect(hasComponent(world, e, Position)).toBe(false);
  });

  it("supports tag components", () => {
    const IsPlayer = defineTag();
    const world = createWorld();
    const e = addEntity(world);

    addComponent(world, e, IsPlayer);
    expect(hasComponent(world, e, IsPlayer)).toBe(true);

    removeComponent(world, e, IsPlayer);
    expect(hasComponent(world, e, IsPlayer)).toBe(false);
  });

  it("provides direct store access for SoA iteration", () => {
    const Position = defineComponent({ x: Float32Array, y: Float32Array });
    const world = createWorld();
    const e = addEntity(world);

    addComponent(world, e, Position, { x: 42, y: 99 });

    const stores = getStore(world, Position)!;
    const idx = getIndex(e);
    expect(stores.x[idx]).toBe(42);
    expect(stores.y[idx]).toBe(99);
  });
});

describe("World - queries", () => {
  it("queries entities with matching components", () => {
    const Position = defineComponent({ x: Float32Array });
    const Velocity = defineComponent({ vx: Float32Array });
    const world = createWorld();

    const e1 = addEntity(world);
    addComponent(world, e1, Position, { x: 0 });
    addComponent(world, e1, Velocity, { vx: 1 });

    const e2 = addEntity(world);
    addComponent(world, e2, Position, { x: 0 });

    const results = queryResults(world, [Position, Velocity]);
    expect(results).toContain(getIndex(e1));
    expect(results).not.toContain(getIndex(e2));
  });

  it("queries with Not modifier", () => {
    const Position = defineComponent({ x: Float32Array });
    const Frozen = defineTag();
    const world = createWorld();

    const e1 = addEntity(world);
    addComponent(world, e1, Position);

    const e2 = addEntity(world);
    addComponent(world, e2, Position);
    addComponent(world, e2, Frozen);

    const results = queryResults(world, [Position, Not(Frozen)]);
    expect(results).toContain(getIndex(e1));
    expect(results).not.toContain(getIndex(e2));
  });

  it("returns cached query result sets", () => {
    const Position = defineComponent({ x: Float32Array });
    const world = createWorld();

    const q1 = query(world, [Position]);
    const q2 = query(world, [Position]);
    expect(q1).toBe(q2);
  });

  it("removes entity from queries when entity is destroyed", () => {
    const Position = defineComponent({ x: Float32Array });
    const world = createWorld();

    const e = addEntity(world);
    addComponent(world, e, Position);

    const q = query(world, [Position]);
    expect(queryEntities(q)).toContain(getIndex(e));

    removeEntity(world, e);
    expect(queryEntities(q)).not.toContain(getIndex(e));
  });
});

describe("World - systems and tick", () => {
  it("ticks systems that modify component data", () => {
    const Position = defineComponent({ x: Float32Array });
    const Velocity = defineComponent({ vx: Float32Array });
    const world = createWorld();

    const e = addEntity(world);
    addComponent(world, e, Position, { x: 0 });
    addComponent(world, e, Velocity, { vx: 10 });

    const posStore = getStore(world, Position)!;
    const velStore = getStore(world, Velocity)!;
    const q = query(world, [Position, Velocity]);

    const movementSystem = (w: any, dt: number) => {
      for (const eid of queryEntities(q)) {
        posStore.x[eid]! += velStore.vx[eid]! * dt;
      }
    };

    addSystem(world, "update", movementSystem);
    tick(world, 1);

    expect(getComponent(world, Position, e)!.x).toBeCloseTo(10);

    tick(world, 0.5);
    expect(getComponent(world, Position, e)!.x).toBeCloseTo(15);
  });

  it("runs systems in phase order", () => {
    const world = createWorld();
    const order: string[] = [];

    addSystem(world, "postUpdate", () => order.push("post"));
    addSystem(world, "preUpdate", () => order.push("pre"));
    addSystem(world, "update", () => order.push("update"));

    tick(world, 16);
    expect(order).toEqual(["pre", "update", "post"]);
  });
});

describe("World - isolation", () => {
  it("maintains independent state across worlds", () => {
    const Position = defineComponent({ x: Float32Array });
    const world1 = createWorld();
    const world2 = createWorld();

    const e1 = addEntity(world1);
    addComponent(world1, e1, Position, { x: 100 });

    const e2 = addEntity(world2);
    addComponent(world2, e2, Position, { x: 200 });

    expect(getComponent(world1, Position, e1)!.x).toBe(100);
    expect(getComponent(world2, Position, e2)!.x).toBe(200);
  });
});

describe("World - destroyWorld", () => {
  it("cleans up all resources", () => {
    const Position = defineComponent({ x: Float32Array });
    const world = createWorld();

    const e = addEntity(world);
    addComponent(world, e, Position, { x: 5 });
    query(world, [Position]);

    destroyWorld(world);

    expect(world.entityIndex.aliveCount).toBe(0);
    expect(world.components.storages.size).toBe(0);
    expect(world.queries.cache.size).toBe(0);
  });
});
