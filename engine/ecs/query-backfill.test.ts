/**
 * Test query backfill specifically — when a query is defined
 * AFTER entities already exist, it should find all matching entities.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createWorld, addEntity, addComponent, query } from "./world.js";
import { queryEntities } from "./query.js";
import { defineComponent, resetComponentIdCounter } from "./component.js";

beforeEach(() => {
  resetComponentIdCounter();
});

describe("Query backfill", () => {
  it("finds all entities when query is defined after entity creation", () => {
    const A = defineComponent({ x: Float32Array });
    const B = defineComponent({ y: Float32Array });

    const world = createWorld();

    // Create 5 entities with both A and B
    for (let i = 0; i < 5; i++) {
      const e = addEntity(world);
      addComponent(world, e, A, { x: i });
      addComponent(world, e, B, { y: i * 10 });
    }

    // Query defined AFTER entities — must backfill
    const q = query(world, [A, B]);
    const results = queryEntities(q);

    console.log("Backfill results:", [...results]);
    console.log("Expected 5, got", results.length);

    expect(results.length).toBe(5);
  });

  it("finds entities at higher indices after initial capacity", () => {
    const A = defineComponent({ x: Float32Array });

    const world = createWorld(4); // small initial capacity

    // Create 6 entities (forces growth)
    for (let i = 0; i < 6; i++) {
      const e = addEntity(world);
      addComponent(world, e, A, { x: i });
    }

    const q = query(world, [A]);
    const results = queryEntities(q);

    console.log("Growth backfill results:", [...results]);
    expect(results.length).toBe(6);
  });

  it("aliveEntities returns correct dense values", () => {
    const world = createWorld();

    for (let i = 0; i < 5; i++) {
      addEntity(world);
    }

    const alive = world.queries.aliveEntities!();
    console.log("Alive entities:", alive);
    console.log("Entity index aliveCount:", world.entityIndex.aliveCount);
    console.log("Dense array:", [
      ...world.entityIndex.dense.subarray(0, world.entityIndex.aliveCount),
    ]);

    expect(alive.length).toBe(5);
  });
});
