import { describe, it, expect, beforeEach } from "vitest";
import { instantiateScene } from "./instantiate.js";
import { createNode } from "./node.js";
import { createSceneRegistry, registerScene } from "./registry.js";
import { resetComponentIdCounter } from "../ecs/component.js";
import {
  createWorld,
  hasComponent,
  getComponent,
} from "../ecs/world.js";
import { Transform } from "../ecs/components/transform.js";
import { Velocity } from "../ecs/components/velocity.js";
import { SceneRef } from "../core-components/scene-ref.js";

beforeEach(() => {
  resetComponentIdCounter();
});

describe("instantiateScene", () => {
  it("creates an entity with SceneRef", () => {
    const world = createWorld();
    const registry = createSceneRegistry();
    const scene = createNode("node");
    const sceneId = registerScene(registry, scene);

    const entity = instantiateScene(world, registry, scene, sceneId);

    expect(hasComponent(world, entity, SceneRef)).toBe(true);
    expect(getComponent(world, SceneRef, entity)!.sceneId).toBe(sceneId);
  });

  it("adds Transform from node data", () => {
    const world = createWorld();
    const registry = createSceneRegistry();
    const scene = createNode("node", {}, [
      createNode("transform", { x: 10, y: 20, z: 30 }),
    ]);
    const sceneId = registerScene(registry, scene);

    const entity = instantiateScene(world, registry, scene, sceneId);

    expect(hasComponent(world, entity, Transform)).toBe(true);
    const t = getComponent(world, Transform, entity)!;
    expect(t.px).toBeCloseTo(10);
    expect(t.py).toBeCloseTo(20);
    expect(t.pz).toBeCloseTo(30);
  });

  it("adds Transform from array position format", () => {
    const world = createWorld();
    const registry = createSceneRegistry();
    const scene = createNode("node", {}, [
      createNode("transform", { position: [5, 10, 15] }),
    ]);
    const sceneId = registerScene(registry, scene);

    const entity = instantiateScene(world, registry, scene, sceneId);
    const t = getComponent(world, Transform, entity)!;
    expect(t.px).toBeCloseTo(5);
    expect(t.py).toBeCloseTo(10);
    expect(t.pz).toBeCloseTo(15);
  });

  it("adds Velocity from body node", () => {
    const world = createWorld();
    const registry = createSceneRegistry();
    const scene = createNode("node", {}, [
      createNode("transform", { x: 0, y: 0, z: 0 }),
      createNode("body", { velocity: [1, 2, 3] }),
    ]);
    const sceneId = registerScene(registry, scene);

    const entity = instantiateScene(world, registry, scene, sceneId);

    expect(hasComponent(world, entity, Velocity)).toBe(true);
    const v = getComponent(world, Velocity, entity)!;
    expect(v.vx).toBeCloseTo(1);
    expect(v.vy).toBeCloseTo(2);
    expect(v.vz).toBeCloseTo(3);
  });

  it("does not add rendering nodes as ECS components", () => {
    const world = createWorld();
    const registry = createSceneRegistry();
    const scene = createNode("node", {}, [
      createNode("transform", { x: 0, y: 0, z: 0 }),
      createNode("renderer", {}, [
        createNode("mesh", { geometry: "./ship" }),
      ]),
    ]);
    const sceneId = registerScene(registry, scene);

    const entity = instantiateScene(world, registry, scene, sceneId);

    // Entity should have Transform and SceneRef, but no mesh component
    expect(hasComponent(world, entity, Transform)).toBe(true);
    expect(hasComponent(world, entity, SceneRef)).toBe(true);
  });

  it("applies position override", () => {
    const world = createWorld();
    const registry = createSceneRegistry();
    const scene = createNode("node", {}, [
      createNode("transform", { x: 10, y: 20, z: 30 }),
    ]);
    const sceneId = registerScene(registry, scene);

    const entity = instantiateScene(world, registry, scene, sceneId, {
      position: [99, 88, 77],
    });

    const t = getComponent(world, Transform, entity)!;
    expect(t.px).toBeCloseTo(99);
    expect(t.py).toBeCloseTo(88);
    expect(t.pz).toBeCloseTo(77);
  });

  it("applies velocity override", () => {
    const world = createWorld();
    const registry = createSceneRegistry();
    const scene = createNode("node", {}, [
      createNode("transform", { x: 0, y: 0, z: 0 }),
    ]);
    const sceneId = registerScene(registry, scene);

    const entity = instantiateScene(world, registry, scene, sceneId, {
      velocity: [5, 0, 0],
    });

    expect(hasComponent(world, entity, Velocity)).toBe(true);
    expect(getComponent(world, Velocity, entity)!.vx).toBeCloseTo(5);
  });

  it("auto-registers scene if no sceneId provided", () => {
    const world = createWorld();
    const registry = createSceneRegistry();
    const scene = createNode("node", {}, [
      createNode("transform", { x: 1, y: 2, z: 3 }),
      createNode("renderer", {}, [
        createNode("mesh", { color: 0xff0000 }),
      ]),
    ]);

    const entity = instantiateScene(world, registry, scene);

    expect(hasComponent(world, entity, SceneRef)).toBe(true);
    // The registered scene's visual nodes should be accessible
    const sceneId = getComponent(world, SceneRef, entity)!.sceneId;
    expect(registry.scenes.has(sceneId)).toBe(true);
  });
});
