import { describe, it, expect, beforeEach } from "vitest";
import {
  createQueryRegistry,
  defineQuery,
  Not,
  Any,
  notifyComponentAdded,
  notifyComponentRemoved,
  queryEntities,
  commitRemovals,
} from "./query.js";
import {
  createBitmaskRegistry,
  registerComponent,
  addComponentBit,
  removeComponentBit,
} from "./bitmask.js";
import { defineComponent, defineTag, resetComponentIdCounter } from "./component.js";

let bitmasks: ReturnType<typeof createBitmaskRegistry>;

beforeEach(() => {
  resetComponentIdCounter();
  bitmasks = createBitmaskRegistry();
});

function addComp(
  entityIndex: number,
  def: ReturnType<typeof defineComponent> | ReturnType<typeof defineTag>,
) {
  registerComponent(bitmasks, def);
  addComponentBit(bitmasks, entityIndex, def);
}

function removeComp(
  entityIndex: number,
  def: ReturnType<typeof defineComponent> | ReturnType<typeof defineTag>,
) {
  removeComponentBit(bitmasks, entityIndex, def);
}

describe("Query - all-of", () => {
  it("matches entities with all required components", () => {
    const Position = defineComponent({ x: Float32Array, y: Float32Array });
    const Velocity = defineComponent({ vx: Float32Array, vy: Float32Array });

    const registry = createQueryRegistry(bitmasks);
    const q = defineQuery(registry, [Position, Velocity]);

    // Entity 0: has both
    addComp(0, Position);
    notifyComponentAdded(registry, 0, Position.id);
    addComp(0, Velocity);
    notifyComponentAdded(registry, 0, Velocity.id);

    // Entity 1: has only Position
    addComp(1, Position);
    notifyComponentAdded(registry, 1, Position.id);

    const results = queryEntities(q);
    expect(results).toContain(0);
    expect(results).not.toContain(1);
  });
});

describe("Query - none-of (Not)", () => {
  it("excludes entities with Not components", () => {
    const Position = defineComponent({ x: Float32Array });
    const Frozen = defineTag();

    const registry = createQueryRegistry(bitmasks);
    const q = defineQuery(registry, [Position, Not(Frozen)]);

    // Entity 0: Position only — should match
    addComp(0, Position);
    notifyComponentAdded(registry, 0, Position.id);

    // Entity 1: Position + Frozen — should not match
    addComp(1, Position);
    notifyComponentAdded(registry, 1, Position.id);
    addComp(1, Frozen);
    notifyComponentAdded(registry, 1, Frozen.id);

    const results = queryEntities(q);
    expect(results).toContain(0);
    expect(results).not.toContain(1);
  });

  it("adds entity back when Not component is removed", () => {
    const Position = defineComponent({ x: Float32Array });
    const Frozen = defineTag();

    const registry = createQueryRegistry(bitmasks);
    const q = defineQuery(registry, [Position, Not(Frozen)]);

    addComp(0, Position);
    notifyComponentAdded(registry, 0, Position.id);
    addComp(0, Frozen);
    notifyComponentAdded(registry, 0, Frozen.id);

    expect(queryEntities(q)).not.toContain(0);

    removeComp(0, Frozen);
    notifyComponentRemoved(registry, 0, Frozen.id);

    expect(queryEntities(q)).toContain(0);
  });
});

describe("Query - any-of (Any)", () => {
  it("matches entities with at least one Any component", () => {
    const DamageFlash = defineTag();
    const HealFlash = defineTag();
    const Position = defineComponent({ x: Float32Array });

    const registry = createQueryRegistry(bitmasks);
    const q = defineQuery(registry, [Position, Any(DamageFlash, HealFlash)]);

    // Entity 0: Position + DamageFlash
    addComp(0, Position);
    notifyComponentAdded(registry, 0, Position.id);
    addComp(0, DamageFlash);
    notifyComponentAdded(registry, 0, DamageFlash.id);

    // Entity 1: Position + HealFlash
    addComp(1, Position);
    notifyComponentAdded(registry, 1, Position.id);
    addComp(1, HealFlash);
    notifyComponentAdded(registry, 1, HealFlash.id);

    // Entity 2: Position only
    addComp(2, Position);
    notifyComponentAdded(registry, 2, Position.id);

    const results = queryEntities(q);
    expect(results).toContain(0);
    expect(results).toContain(1);
    expect(results).not.toContain(2);
  });
});

describe("Query - deferred removal", () => {
  it("defers removal during iteration", () => {
    const Position = defineComponent({ x: Float32Array });

    const registry = createQueryRegistry(bitmasks);
    const q = defineQuery(registry, [Position]);

    addComp(0, Position);
    notifyComponentAdded(registry, 0, Position.id);
    addComp(1, Position);
    notifyComponentAdded(registry, 1, Position.id);

    // Remove component from entity 0 — should be deferred
    removeComp(0, Position);
    notifyComponentRemoved(registry, 0, Position.id);

    // Before commit: entity 0 still in dense array
    expect(q.dense).toContain(0);
    expect(q.dirty).toBe(true);

    // After commit: entity 0 removed
    commitRemovals(q);
    expect(q.dense).not.toContain(0);
    expect(q.dense).toContain(1);
  });

  it("auto-commits on queryEntities", () => {
    const Position = defineComponent({ x: Float32Array });

    const registry = createQueryRegistry(bitmasks);
    const q = defineQuery(registry, [Position]);

    addComp(0, Position);
    notifyComponentAdded(registry, 0, Position.id);

    removeComp(0, Position);
    notifyComponentRemoved(registry, 0, Position.id);

    // queryEntities commits automatically
    const results = queryEntities(q);
    expect(results).not.toContain(0);
  });
});

describe("Query - caching", () => {
  it("returns the same result set for identical queries", () => {
    const Position = defineComponent({ x: Float32Array });
    const Velocity = defineComponent({ vx: Float32Array });

    const registry = createQueryRegistry(bitmasks);
    const q1 = defineQuery(registry, [Position, Velocity]);
    const q2 = defineQuery(registry, [Position, Velocity]);

    expect(q1).toBe(q2);
  });

  it("returns different result sets for different queries", () => {
    const Position = defineComponent({ x: Float32Array });
    const Velocity = defineComponent({ vx: Float32Array });

    const registry = createQueryRegistry(bitmasks);
    const q1 = defineQuery(registry, [Position]);
    const q2 = defineQuery(registry, [Position, Velocity]);

    expect(q1).not.toBe(q2);
  });
});
