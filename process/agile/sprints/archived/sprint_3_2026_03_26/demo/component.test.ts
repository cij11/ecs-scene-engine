import { describe, it, expect, beforeEach } from "vitest";
import {
  defineComponent,
  defineTag,
  createComponentRegistry,
  ensureRegistered,
  ensureCapacity,
  setComponentData,
  getComponentData,
  getComponentStore,
  resetComponentIdCounter,
} from "./component.js";
import { createEntityIndex, createEntity, getIndex } from "./entity.js";

beforeEach(() => {
  resetComponentIdCounter();
});

describe("defineComponent", () => {
  it("assigns unique IDs to components", () => {
    const A = defineComponent({ x: Float32Array });
    const B = defineComponent({ y: Float32Array });
    expect(A.id).not.toBe(B.id);
  });

  it("stores the schema", () => {
    const Position = defineComponent({ x: Float32Array, y: Float32Array });
    expect(Position.schema.x).toBe(Float32Array);
    expect(Position.schema.y).toBe(Float32Array);
    expect(Position.isTag).toBe(false);
  });
});

describe("defineTag", () => {
  it("creates a tag with no schema", () => {
    const IsPlayer = defineTag();
    expect(IsPlayer.schema).toBeNull();
    expect(IsPlayer.isTag).toBe(true);
  });

  it("assigns unique IDs shared with components", () => {
    const A = defineComponent({ x: Float32Array });
    const T = defineTag();
    expect(T.id).not.toBe(A.id);
  });
});

describe("ComponentRegistry", () => {
  it("registers and stores component data", () => {
    const Position = defineComponent({ x: Float32Array, y: Float32Array });
    const registry = createComponentRegistry(16);
    const entityIndex = createEntityIndex(16);

    ensureRegistered(registry, Position);
    const eid = createEntity(entityIndex);

    setComponentData(registry, Position, eid, { x: 10, y: 20 });
    const data = getComponentData(registry, Position, eid);

    expect(data).toEqual({ x: 10, y: 20 });
  });

  it("returns correct data for multiple entities", () => {
    const Velocity = defineComponent({ vx: Float32Array, vy: Float32Array });
    const registry = createComponentRegistry(16);
    const entityIndex = createEntityIndex(16);

    ensureRegistered(registry, Velocity);
    const e1 = createEntity(entityIndex);
    const e2 = createEntity(entityIndex);

    setComponentData(registry, Velocity, e1, { vx: 1, vy: 2 });
    setComponentData(registry, Velocity, e2, { vx: 3, vy: 4 });

    expect(getComponentData(registry, Velocity, e1)).toEqual({ vx: 1, vy: 2 });
    expect(getComponentData(registry, Velocity, e2)).toEqual({ vx: 3, vy: 4 });
  });

  it("does not allocate storage for tags", () => {
    const IsEnemy = defineTag();
    const registry = createComponentRegistry(16);

    ensureRegistered(registry, IsEnemy);
    expect(registry.storages.has(IsEnemy.id)).toBe(false);
  });

  it("provides direct store access", () => {
    const Position = defineComponent({ x: Float32Array, y: Float32Array });
    const registry = createComponentRegistry(16);
    const entityIndex = createEntityIndex(16);

    ensureRegistered(registry, Position);
    const eid = createEntity(entityIndex);
    const idx = getIndex(eid);

    const stores = getComponentStore(registry, Position)!;
    stores.x[idx] = 42;
    stores.y[idx] = 99;

    expect(getComponentData(registry, Position, eid)).toEqual({ x: 42, y: 99 });
  });

  it("grows storage when capacity is exceeded", () => {
    const Health = defineComponent({ current: Float32Array, max: Float32Array });
    const registry = createComponentRegistry(4);
    const entityIndex = createEntityIndex(4);

    ensureRegistered(registry, Health);

    const ids: number[] = [];
    for (let i = 0; i < 10; i++) {
      const eid = createEntity(entityIndex);
      ids.push(eid);
      ensureCapacity(registry, getIndex(eid) + 1);
      setComponentData(registry, Health, eid, { current: i * 10, max: 100 });
    }

    expect(registry.capacity).toBeGreaterThanOrEqual(10);

    for (let i = 0; i < ids.length; i++) {
      const data = getComponentData(registry, Health, ids[i]!);
      expect(data).toEqual({ current: i * 10, max: 100 });
    }
  });

  it("supports multiple TypedArray types", () => {
    const Stats = defineComponent({
      level: Uint8Array,
      hp: Uint16Array,
      damage: Int32Array,
      speed: Float64Array,
    });
    const registry = createComponentRegistry(16);
    const entityIndex = createEntityIndex(16);

    ensureRegistered(registry, Stats);
    const eid = createEntity(entityIndex);

    setComponentData(registry, Stats, eid, { level: 5, hp: 1000, damage: -50, speed: 3.14 });
    const data = getComponentData(registry, Stats, eid);

    expect(data!.level).toBe(5);
    expect(data!.hp).toBe(1000);
    expect(data!.damage).toBe(-50);
    expect(data!.speed).toBeCloseTo(3.14);
  });
});
