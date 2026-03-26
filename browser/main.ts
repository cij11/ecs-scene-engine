import { addSystem } from "../engine/ecs/world.js";
import { createSceneRegistry, registerScene } from "../engine/scene/registry.js";
import { createNode } from "../engine/scene/node.js";
import { createWorldNode, addChildWorld, tickWorldTree } from "../engine/scene/world-tree.js";
import { instantiateScene } from "../engine/scene/instantiate.js";
import { getIndex } from "../engine/ecs/entity.js";
import { movementSystem } from "../engine/ecs/systems/movement.js";

import { ThreeJSRenderer } from "../view/threejs/index.js";
import { createViewSync, syncWorldTree } from "../view/sync.js";

import { spaceshipScene, astronautScene } from "../game/toy-ship/scenes.js";
import { orbitSystem, wanderSystem } from "../game/toy-ship/systems.js";

// --- Static scene definitions ---

const lightScene = createNode("node", {}, [
  createNode("transform", { position: [10, 10, 10] }),
  createNode("renderer", {}, [
    createNode("light", { lightType: "point", color: 0xffffff, intensity: 100, range: 200 }),
  ]),
]);

const ambientScene = createNode("node", {}, [
  createNode("transform"),
  createNode("renderer", {}, [
    createNode("light", { lightType: "ambient", color: 0xffffff, intensity: 0.4 }),
  ]),
]);

const cameraScene = createNode("node", {}, [
  createNode("transform", { position: [0, 8, 15] }),
  createNode("renderer", {}, [
    createNode("camera", { projection: "perspective", fov: 60, near: 0.1, far: 1000 }),
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
  const shipSceneId = registerScene(sceneRegistry, spaceshipScene);
  const astronautSceneId = registerScene(sceneRegistry, astronautScene);
  const lightSceneId = registerScene(sceneRegistry, lightScene);
  const ambientSceneId = registerScene(sceneRegistry, ambientScene);
  const cameraSceneId = registerScene(sceneRegistry, cameraScene);

  // --- Space world (root) ---
  const spaceNode = createWorldNode();

  // Add ship entity at radius 5 from origin
  const shipEntity = instantiateScene(
    spaceNode.world, sceneRegistry, spaceshipScene, shipSceneId,
    { position: [5, 0, 0] },
  );
  const shipEntityIdx = getIndex(shipEntity);

  // Add lighting and camera to space world
  instantiateScene(spaceNode.world, sceneRegistry, lightScene, lightSceneId);
  instantiateScene(spaceNode.world, sceneRegistry, ambientScene, ambientSceneId);
  instantiateScene(spaceNode.world, sceneRegistry, cameraScene, cameraSceneId);

  // Space systems
  addSystem(spaceNode.world, "update", orbitSystem);

  // --- Ship interior world (child of space) ---
  const interiorNode = createWorldNode();
  addChildWorld(spaceNode, interiorNode, shipEntityIdx);

  // Spawn 3 astronauts at different positions inside the ship
  const astronautPositions: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 1],
    [-1, 0, -1],
  ];

  for (const pos of astronautPositions) {
    instantiateScene(
      interiorNode.world, sceneRegistry, astronautScene, astronautSceneId,
      { position: pos, velocity: [(Math.random() - 0.5), 0, (Math.random() - 0.5)] },
    );
  }

  // Interior systems
  addSystem(interiorNode.world, "update", movementSystem);
  addSystem(interiorNode.world, "postUpdate", wanderSystem);

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
    renderer.endFrame();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
