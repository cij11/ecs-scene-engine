/**
 * Debug test: simulate the exact sync flow from main.ts
 * to find why only 3 of 5 entities get render handles.
 */

import { describe, it, expect } from "vitest";
import { createSceneRegistry, registerScene } from "../../engine/scene/registry.js";
import { createNode } from "../../engine/scene/node.js";
import { createWorldNode } from "../../engine/scene/world-tree.js";
import { instantiateScene } from "../../engine/scene/instantiate.js";
import { query, getStore } from "../../engine/ecs/world.js";
import { queryEntities } from "../../engine/ecs/query.js";
import { Transform } from "../../engine/ecs/components/transform.js";
import { Transform as SyncTransform } from "../../view/sync.js";
import { SceneRef } from "../../engine/core-components/scene-ref.js";
import { sunScene, spaceshipScene } from "./scenes.js";

describe("Debug sync", () => {
  it("Transform from engine and sync are the same object", () => {
    expect(Transform).toBe(SyncTransform);
    expect(Transform.id).toBe(SyncTransform.id);
  });

  it("all 5 entities match [Transform, SceneRef] query", () => {
    const sceneRegistry = createSceneRegistry();
    const sunId = registerScene(sceneRegistry, sunScene);
    const shipId = registerScene(sceneRegistry, spaceshipScene);
    const lightScene = createNode("node", {}, [
      createNode("transform", { position: [0, 10, 0] }),
      createNode("renderer", {}, [createNode("light", { lightType: "point" })]),
    ]);
    const ambientScene = createNode("node", {}, [
      createNode("transform"),
      createNode("renderer", {}, [createNode("light", { lightType: "ambient" })]),
    ]);
    const cameraScene = createNode("node", {}, [
      createNode("transform", { position: [0, 12, 0] }),
      createNode("renderer", {}, [createNode("camera", { projection: "perspective" })]),
    ]);
    const lightId = registerScene(sceneRegistry, lightScene);
    const ambientId = registerScene(sceneRegistry, ambientScene);
    const cameraId = registerScene(sceneRegistry, cameraScene);

    const spaceNode = createWorldNode();

    // Create entities in exact same order as main.ts
    instantiateScene(spaceNode.world, sceneRegistry, sunScene, sunId, { position: [0, 0, 0] });
    instantiateScene(spaceNode.world, sceneRegistry, spaceshipScene, shipId, {
      position: [5, 0, 0],
    });
    instantiateScene(spaceNode.world, sceneRegistry, lightScene, lightId);
    instantiateScene(spaceNode.world, sceneRegistry, ambientScene, ambientId);
    instantiateScene(spaceNode.world, sceneRegistry, cameraScene, cameraId);

    expect(spaceNode.world.entityIndex.aliveCount).toBe(5);

    // Now query AFTER all entities are created (like sync does)
    const q = query(spaceNode.world, [Transform, SceneRef]);
    const results = queryEntities(q);

    console.log("Query results:", results);
    console.log("Transform.id:", Transform.id);
    console.log("SceneRef.id:", SceneRef.id);

    // Check each entity individually
    const tStore = getStore(spaceNode.world, Transform);
    const sStore = getStore(spaceNode.world, SceneRef);
    console.log("Transform store exists:", !!tStore);
    console.log("SceneRef store exists:", !!sStore);

    for (let i = 0; i < 5; i++) {
      const hasBitmask = spaceNode.world.bitmasks.masks.has(Transform.id);
      console.log(`Entity ${i}: Transform bitmask registered: ${hasBitmask}`);
    }

    expect(results.length).toBe(5);
  });
});
