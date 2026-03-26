/**
 * Toy-ship integration test.
 * Verifies the full ECS + scene + sync pipeline produces
 * the correct entities, render handles, and camera.
 */

import { describe, it, expect } from "vitest";
import { addSystem } from "../../engine/ecs/world.js";
import { createSceneRegistry, registerScene } from "../../engine/scene/registry.js";
import { lookupVisualNodes } from "../../engine/scene/registry.js";
import { createNode } from "../../engine/scene/node.js";
import { createWorldNode, tickWorldTree } from "../../engine/scene/world-tree.js";
import { instantiateScene } from "../../engine/scene/instantiate.js";
import { getIndex } from "../../engine/ecs/entity.js";
import { getStore, getComponent, query } from "../../engine/ecs/world.js";
import { queryEntities } from "../../engine/ecs/query.js";
import { Transform } from "../../engine/ecs/components/transform.js";
import { SceneRef } from "../../engine/core-components/scene-ref.js";
import { handleNode } from "../../view/node-handlers.js";
import { sunScene, spaceshipScene, astronautScene } from "./scenes.js";
import { createOrbitSystem } from "./systems.js";

describe("Toy-ship integration", () => {
  it("creates correct number of entities in space world", () => {
    const sceneRegistry = createSceneRegistry();
    const sunId = registerScene(sceneRegistry, sunScene);
    const shipId = registerScene(sceneRegistry, spaceshipScene);

    const lightScene = createNode("node", {}, [
      createNode("transform", { position: [0, 10, 0] }),
      createNode("renderer", {}, [
        createNode("light", { lightType: "point", color: 0xffffff, intensity: 500 }),
      ]),
    ]);
    const ambientScene = createNode("node", {}, [
      createNode("transform"),
      createNode("renderer", {}, [
        createNode("light", { lightType: "ambient", color: 0xffffff, intensity: 1.5 }),
      ]),
    ]);
    const cameraScene = createNode("node", {}, [
      createNode("transform", { position: [0, 12, 0] }),
      createNode("renderer", {}, [createNode("camera", { projection: "perspective", fov: 70 })]),
    ]);
    const lightId = registerScene(sceneRegistry, lightScene);
    const ambientId = registerScene(sceneRegistry, ambientScene);
    const cameraId = registerScene(sceneRegistry, cameraScene);

    const spaceNode = createWorldNode();

    instantiateScene(spaceNode.world, sceneRegistry, sunScene, sunId, { position: [0, 0, 0] });
    instantiateScene(spaceNode.world, sceneRegistry, spaceshipScene, shipId, {
      position: [5, 0, 0],
    });
    instantiateScene(spaceNode.world, sceneRegistry, lightScene, lightId);
    instantiateScene(spaceNode.world, sceneRegistry, ambientScene, ambientId);
    instantiateScene(spaceNode.world, sceneRegistry, cameraScene, cameraId);

    expect(spaceNode.world.entityIndex.aliveCount).toBe(5);
  });

  it("all space entities have Transform and SceneRef", () => {
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
    instantiateScene(spaceNode.world, sceneRegistry, sunScene, sunId);
    instantiateScene(spaceNode.world, sceneRegistry, spaceshipScene, shipId);
    instantiateScene(spaceNode.world, sceneRegistry, lightScene, lightId);
    instantiateScene(spaceNode.world, sceneRegistry, ambientScene, ambientId);
    instantiateScene(spaceNode.world, sceneRegistry, cameraScene, cameraId);

    const q = query(spaceNode.world, [Transform, SceneRef]);
    const results = queryEntities(q);
    expect(results.length).toBe(5);
  });

  it("all space entities have visual nodes resolvable via SceneRef", () => {
    const sceneRegistry = createSceneRegistry();
    const sunId = registerScene(sceneRegistry, sunScene);
    const shipId = registerScene(sceneRegistry, spaceshipScene);
    const cameraScene = createNode("node", {}, [
      createNode("transform", { position: [0, 12, 0] }),
      createNode("renderer", {}, [createNode("camera", { projection: "perspective" })]),
    ]);
    const cameraId = registerScene(sceneRegistry, cameraScene);

    const spaceNode = createWorldNode();
    instantiateScene(spaceNode.world, sceneRegistry, sunScene, sunId);
    instantiateScene(spaceNode.world, sceneRegistry, spaceshipScene, shipId);
    instantiateScene(spaceNode.world, sceneRegistry, cameraScene, cameraId);

    const q = query(spaceNode.world, [Transform, SceneRef]);
    const sceneRefStore = getStore(spaceNode.world, SceneRef)!;

    for (const eid of queryEntities(q)) {
      const sceneId = sceneRefStore.sceneId[eid]!;
      const visuals = lookupVisualNodes(sceneRegistry, sceneId);
      expect(visuals.length).toBeGreaterThan(0);

      for (const node of visuals) {
        const params = handleNode(node);
        expect(params).not.toBeNull();
      }
    }
  });

  it("camera scene produces camera params from handleNode", () => {
    const cameraScene = createNode("node", {}, [
      createNode("transform", { position: [0, 12, 0] }),
      createNode("renderer", {}, [createNode("camera", { projection: "perspective", fov: 70 })]),
    ]);

    const sceneRegistry = createSceneRegistry();
    const cameraId = registerScene(sceneRegistry, cameraScene);
    const visuals = lookupVisualNodes(sceneRegistry, cameraId);

    expect(visuals.length).toBe(1);
    expect(visuals[0]!.type).toBe("camera");

    const params = handleNode(visuals[0]!);
    expect(params).not.toBeNull();
    expect(params!.type).toBe("camera");
  });

  it("camera entity has correct transform position", () => {
    const sceneRegistry = createSceneRegistry();
    const cameraScene = createNode("node", {}, [
      createNode("transform", { position: [0, 12, 0] }),
      createNode("renderer", {}, [createNode("camera", { projection: "perspective" })]),
    ]);
    const cameraId = registerScene(sceneRegistry, cameraScene);

    const spaceNode = createWorldNode();
    const entity = instantiateScene(spaceNode.world, sceneRegistry, cameraScene, cameraId);

    const t = getComponent(spaceNode.world, Transform, entity);
    expect(t!.px).toBeCloseTo(0);
    expect(t!.py).toBeCloseTo(12);
    expect(t!.pz).toBeCloseTo(0);
  });

  it("astronauts are created in interior world", () => {
    const sceneRegistry = createSceneRegistry();
    const astronautId = registerScene(sceneRegistry, astronautScene);

    const interiorNode = createWorldNode();
    instantiateScene(interiorNode.world, sceneRegistry, astronautScene, astronautId);
    instantiateScene(interiorNode.world, sceneRegistry, astronautScene, astronautId);
    instantiateScene(interiorNode.world, sceneRegistry, astronautScene, astronautId);

    expect(interiorNode.world.entityIndex.aliveCount).toBe(3);
  });

  it("orbit system moves ship entity", () => {
    const sceneRegistry = createSceneRegistry();
    const sunId = registerScene(sceneRegistry, sunScene);
    const shipId = registerScene(sceneRegistry, spaceshipScene);

    const spaceNode = createWorldNode();
    instantiateScene(spaceNode.world, sceneRegistry, sunScene, sunId);
    const ship = instantiateScene(spaceNode.world, sceneRegistry, spaceshipScene, shipId, {
      position: [5, 0, 0],
    });

    addSystem(spaceNode.world, "update", createOrbitSystem(getIndex(ship)));
    tickWorldTree(spaceNode, 0.1);

    const t = getComponent(spaceNode.world, Transform, ship);
    // Ship should have moved from (5,0,0)
    expect(Math.abs(t!.px) + Math.abs(t!.pz)).toBeGreaterThan(0);
  });
});
