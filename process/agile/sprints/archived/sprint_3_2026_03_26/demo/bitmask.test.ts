import { describe, it, expect, beforeEach } from "vitest";
import {
  createBitmaskRegistry,
  registerComponent,
  addComponentBit,
  removeComponentBit,
  hasComponentBit,
  clearAllBits,
  growBitmaskCapacity,
} from "./bitmask.js";
import { defineComponent, defineTag, resetComponentIdCounter } from "./component.js";

beforeEach(() => {
  resetComponentIdCounter();
});

describe("BitmaskRegistry", () => {
  it("registers components with unique bit positions", () => {
    const registry = createBitmaskRegistry();
    const A = defineComponent({ x: Float32Array });
    const B = defineComponent({ y: Float32Array });

    const maskA = registerComponent(registry, A);
    const maskB = registerComponent(registry, B);

    expect(maskA.bitflag).not.toBe(maskB.bitflag);
    expect(maskA.generationId).toBe(0);
    expect(maskB.generationId).toBe(0);
  });

  it("returns the same mask for the same component", () => {
    const registry = createBitmaskRegistry();
    const A = defineComponent({ x: Float32Array });

    const mask1 = registerComponent(registry, A);
    const mask2 = registerComponent(registry, A);

    expect(mask1).toBe(mask2);
  });

  it("adds and checks component bits", () => {
    const registry = createBitmaskRegistry();
    const A = defineComponent({ x: Float32Array });
    const B = defineComponent({ y: Float32Array });

    registerComponent(registry, A);
    registerComponent(registry, B);

    addComponentBit(registry, 0, A);
    addComponentBit(registry, 0, B);
    addComponentBit(registry, 1, A);

    expect(hasComponentBit(registry, 0, A)).toBe(true);
    expect(hasComponentBit(registry, 0, B)).toBe(true);
    expect(hasComponentBit(registry, 1, A)).toBe(true);
    expect(hasComponentBit(registry, 1, B)).toBe(false);
  });

  it("removes component bits", () => {
    const registry = createBitmaskRegistry();
    const A = defineComponent({ x: Float32Array });

    registerComponent(registry, A);
    addComponentBit(registry, 0, A);
    expect(hasComponentBit(registry, 0, A)).toBe(true);

    removeComponentBit(registry, 0, A);
    expect(hasComponentBit(registry, 0, A)).toBe(false);
  });

  it("clears all bits for an entity", () => {
    const registry = createBitmaskRegistry();
    const A = defineComponent({ x: Float32Array });
    const B = defineComponent({ y: Float32Array });

    registerComponent(registry, A);
    registerComponent(registry, B);

    addComponentBit(registry, 0, A);
    addComponentBit(registry, 0, B);

    clearAllBits(registry, 0);

    expect(hasComponentBit(registry, 0, A)).toBe(false);
    expect(hasComponentBit(registry, 0, B)).toBe(false);
  });

  it("works with tag components", () => {
    const registry = createBitmaskRegistry();
    const IsPlayer = defineTag();

    registerComponent(registry, IsPlayer);
    addComponentBit(registry, 0, IsPlayer);

    expect(hasComponentBit(registry, 0, IsPlayer)).toBe(true);

    removeComponentBit(registry, 0, IsPlayer);
    expect(hasComponentBit(registry, 0, IsPlayer)).toBe(false);
  });

  it("overflows to multiple generations beyond 31 components", () => {
    const registry = createBitmaskRegistry();
    const components = [];
    for (let i = 0; i < 40; i++) {
      components.push(defineComponent({ v: Float32Array }));
    }

    for (const c of components) {
      registerComponent(registry, c);
    }

    // Should have 2 generations (0-30 in gen 0, 31-39 in gen 1)
    expect(registry.entityMasks.length).toBe(2);

    // Add all 40 components to entity 0
    for (const c of components) {
      addComponentBit(registry, 0, c);
    }

    // Verify all present
    for (const c of components) {
      expect(hasComponentBit(registry, 0, c)).toBe(true);
    }

    // Remove one from each generation
    removeComponentBit(registry, 0, components[5]!);
    removeComponentBit(registry, 0, components[35]!);

    expect(hasComponentBit(registry, 0, components[5]!)).toBe(false);
    expect(hasComponentBit(registry, 0, components[35]!)).toBe(false);
    expect(hasComponentBit(registry, 0, components[0]!)).toBe(true);
    expect(hasComponentBit(registry, 0, components[39]!)).toBe(true);
  });

  it("grows capacity", () => {
    const registry = createBitmaskRegistry(4);
    const A = defineComponent({ x: Float32Array });

    registerComponent(registry, A);
    addComponentBit(registry, 0, A);

    growBitmaskCapacity(registry, 16);

    expect(registry.capacity).toBe(16);
    expect(hasComponentBit(registry, 0, A)).toBe(true);
  });
});
