import { describe, it, expect } from "vitest";
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
  removeSystem,
  tick,
  Not,
  Any,
  PHASES,
  defineComponent,
  defineTag,
  queryEntities,
  getIndex,
  getGeneration,
} from "./index.js";

describe("engine/index.ts barrel export", () => {
  it("exports all core API functions", () => {
    expect(createWorld).toBeTypeOf("function");
    expect(destroyWorld).toBeTypeOf("function");
    expect(addEntity).toBeTypeOf("function");
    expect(removeEntity).toBeTypeOf("function");
    expect(hasEntity).toBeTypeOf("function");
    expect(addComponent).toBeTypeOf("function");
    expect(removeComponent).toBeTypeOf("function");
    expect(hasComponent).toBeTypeOf("function");
    expect(getComponent).toBeTypeOf("function");
    expect(getStore).toBeTypeOf("function");
    expect(query).toBeTypeOf("function");
    expect(queryResults).toBeTypeOf("function");
    expect(addSystem).toBeTypeOf("function");
    expect(removeSystem).toBeTypeOf("function");
    expect(tick).toBeTypeOf("function");
    expect(Not).toBeTypeOf("function");
    expect(Any).toBeTypeOf("function");
    expect(defineComponent).toBeTypeOf("function");
    expect(defineTag).toBeTypeOf("function");
    expect(queryEntities).toBeTypeOf("function");
    expect(getIndex).toBeTypeOf("function");
    expect(getGeneration).toBeTypeOf("function");
  });

  it("exports PHASES constant", () => {
    expect(PHASES).toEqual(["preUpdate", "update", "postUpdate", "preRender", "cleanup"]);
  });

  it("works end-to-end through the barrel export", () => {
    const Position = defineComponent({ x: Float32Array, y: Float32Array });
    const Velocity = defineComponent({ vx: Float32Array, vy: Float32Array });

    const world = createWorld();
    const e = addEntity(world);

    addComponent(world, e, Position, { x: 0, y: 0 });
    addComponent(world, e, Velocity, { vx: 5, vy: 10 });

    const posStore = getStore(world, Position)!;
    const velStore = getStore(world, Velocity)!;
    const q = query(world, [Position, Velocity]);

    addSystem(world, "update", (_w, dt) => {
      for (const eid of queryEntities(q)) {
        posStore.x[eid]! += velStore.vx[eid]! * dt;
        posStore.y[eid]! += velStore.vy[eid]! * dt;
      }
    });

    tick(world, 1);

    const pos = getComponent(world, Position, e)!;
    expect(pos.x).toBeCloseTo(5);
    expect(pos.y).toBeCloseTo(10);

    destroyWorld(world);
  });
});
