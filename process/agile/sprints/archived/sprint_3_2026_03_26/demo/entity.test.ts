import { describe, it, expect } from "vitest";
import {
  createEntityIndex,
  createEntity,
  destroyEntity,
  hasEntity,
  getIndex,
  getGeneration,
  getAliveEntities,
} from "./entity.js";

describe("EntityIndex", () => {
  it("creates entities with unique IDs", () => {
    const index = createEntityIndex();
    const ids = new Set<number>();
    for (let i = 0; i < 10; i++) {
      ids.add(createEntity(index));
    }
    expect(ids.size).toBe(10);
  });

  it("tracks alive entities", () => {
    const index = createEntityIndex();
    const id1 = createEntity(index);
    const id2 = createEntity(index);
    const id3 = createEntity(index);

    expect(hasEntity(index, id1)).toBe(true);
    expect(hasEntity(index, id2)).toBe(true);
    expect(hasEntity(index, id3)).toBe(true);
    expect(getAliveEntities(index).length).toBe(3);
  });

  it("destroys entities", () => {
    const index = createEntityIndex();
    const id1 = createEntity(index);
    const id2 = createEntity(index);

    expect(destroyEntity(index, id1)).toBe(true);
    expect(hasEntity(index, id1)).toBe(false);
    expect(hasEntity(index, id2)).toBe(true);
    expect(getAliveEntities(index).length).toBe(1);
  });

  it("recycles destroyed entity IDs with incremented generation", () => {
    const index = createEntityIndex();
    const id1 = createEntity(index);
    const originalIndex = getIndex(id1);
    const originalGen = getGeneration(id1);

    destroyEntity(index, id1);
    const id2 = createEntity(index);

    expect(getIndex(id2)).toBe(originalIndex);
    expect(getGeneration(id2)).toBe(originalGen + 1);
    expect(id2).not.toBe(id1);
  });

  it("detects stale entity IDs", () => {
    const index = createEntityIndex();
    const id1 = createEntity(index);

    destroyEntity(index, id1);
    const id2 = createEntity(index);

    expect(hasEntity(index, id1)).toBe(false);
    expect(hasEntity(index, id2)).toBe(true);
  });

  it("returns false when destroying an already destroyed entity", () => {
    const index = createEntityIndex();
    const id1 = createEntity(index);

    expect(destroyEntity(index, id1)).toBe(true);
    expect(destroyEntity(index, id1)).toBe(false);
  });

  it("returns false for out-of-range entity IDs", () => {
    const index = createEntityIndex(8);
    expect(hasEntity(index, 9999)).toBe(false);
    expect(destroyEntity(index, 9999)).toBe(false);
  });

  it("grows capacity when needed", () => {
    const index = createEntityIndex(4);
    const ids: number[] = [];
    for (let i = 0; i < 10; i++) {
      ids.push(createEntity(index));
    }
    expect(index.capacity).toBeGreaterThanOrEqual(10);
    for (const id of ids) {
      expect(hasEntity(index, id)).toBe(true);
    }
  });
});
