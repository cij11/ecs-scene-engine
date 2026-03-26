import { addSystem } from "../engine/ecs/world.js";
import { createSceneRegistry, registerScene } from "../engine/scene/registry.js";
import { createNode } from "../engine/scene/node.js";
import { createWorldNode, addChildWorld, tickWorldTree } from "../engine/scene/world-tree.js";
import { instantiateScene } from "../engine/scene/instantiate.js";
import { getIndex } from "../engine/ecs/entity.js";

import { ThreeJSRenderer } from "../view/threejs/index.js";
import { createViewSync, syncWorldTree } from "../view/sync.js";

import { sunScene, spaceshipScene, astronautScene } from "../game/toy-ship/scenes.js";
import { createOrbitSystem, oscillateSystem } from "../game/toy-ship/systems.js";

// --- Static scene definitions (infrastructure: lights, camera) ---

const lightScene = createNode("node", {}, [
  createNode("transform", { position: [0, 10, 0] }),
  createNode("renderer", {}, [
    createNode("light", { lightType: "point", color: 0xffffff, intensity: 500, range: 50 }),
  ]),
]);

const ambientScene = createNode("node", {}, [
  createNode("transform"),
  createNode("renderer", {}, [
    createNode("light", { lightType: "ambient", color: 0xffffff, intensity: 1.5 }),
  ]),
]);

// Camera is created directly via the renderer (not through ECS)
// because top-down lookAt is simpler than computing quaternions
const cameraScene = createNode("node", {}, [
  createNode("transform", { position: [0, 20, 0] }),
  createNode("renderer", {}, [
    createNode("camera", { projection: "orthographic", near: 0.1, far: 100, zoom: 1 }),
  ]),
]);

// --- Bootstrap ---

async function main() {
  const container = document.getElementById("game")!;

  // Init renderer
  const renderer = new ThreeJSRenderer();
  await renderer.init(container);

  // Scene registry (shared across all worlds)
  const sceneRegistry = createSceneRegistry();
  const sunSceneId = registerScene(sceneRegistry, sunScene);
  const shipSceneId = registerScene(sceneRegistry, spaceshipScene);
  const astronautSceneId = registerScene(sceneRegistry, astronautScene);
  const lightSceneId = registerScene(sceneRegistry, lightScene);
  const ambientSceneId = registerScene(sceneRegistry, ambientScene);
  const cameraSceneId = registerScene(sceneRegistry, cameraScene);

  // --- Space world (root) ---
  const spaceNode = createWorldNode();

  // Sun at origin (entity 0 in space world — orbit system skips it by using entity index directly)
  instantiateScene(spaceNode.world, sceneRegistry, sunScene, sunSceneId, {
    position: [0, 0, 0],
  });

  // Ship starts at orbit radius on X axis
  const shipEntity = instantiateScene(spaceNode.world, sceneRegistry, spaceshipScene, shipSceneId, {
    position: [5, 0, 0],
  });
  const shipEntityIdx = getIndex(shipEntity);

  // Lighting and camera
  instantiateScene(spaceNode.world, sceneRegistry, lightScene, lightSceneId);
  instantiateScene(spaceNode.world, sceneRegistry, ambientScene, ambientSceneId);
  instantiateScene(spaceNode.world, sceneRegistry, cameraScene, cameraSceneId);

  // Space systems — orbit the ship entity
  addSystem(spaceNode.world, "update", createOrbitSystem(shipEntityIdx));

  // --- Ship interior world (child of space) ---
  const interiorNode = createWorldNode();
  addChildWorld(spaceNode, interiorNode, shipEntityIdx);

  // Spawn 3 astronauts — one per axis
  instantiateScene(interiorNode.world, sceneRegistry, astronautScene, astronautSceneId, {
    position: [0, 0, 0],
  });
  instantiateScene(interiorNode.world, sceneRegistry, astronautScene, astronautSceneId, {
    position: [0, 0, 0],
  });
  instantiateScene(interiorNode.world, sceneRegistry, astronautScene, astronautSceneId, {
    position: [0, 0, 0],
  });

  // Interior system — oscillates each astronaut along its axis
  addSystem(interiorNode.world, "update", oscillateSystem);

  // --- View sync ---
  const viewSync = createViewSync(renderer, sceneRegistry);

  // Handle resize
  window.addEventListener("resize", () => {
    renderer.resize(container.clientWidth, container.clientHeight);
  });

  // --- Game loop ---
  let lastTime = performance.now();

  function loop(now: number) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // Tick all worlds root-to-leaf
    tickWorldTree(spaceNode, dt);

    // Sync all worlds to renderer
    renderer.beginFrame();
    syncWorldTree(viewSync, spaceNode);

    // Point camera down at origin (after sync so camera handle exists)
    for (const [, worldState] of viewSync.state.worlds) {
      for (const [, camHandle] of worldState.entityCamera) {
        renderer.lookAt(camHandle, 0, 0, 0);
      }
    }

    renderer.endFrame();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
