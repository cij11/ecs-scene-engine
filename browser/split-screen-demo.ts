/**
 * Split screen demo — two cameras viewing the same scene from different angles.
 * Each camera renders to half the browser window via viewport scissoring.
 */

import { createSceneRegistry, registerScene } from "../engine/scene/registry.js";
import { createNode } from "../engine/scene/node.js";
import { createWorldNode, tickWorldTree } from "../engine/scene/world-tree.js";
import { instantiateScene } from "../engine/scene/instantiate.js";
import { getIndex } from "../engine/ecs/entity.js";
import { addSystem } from "../engine/ecs/world.js";

import { ThreeJSRenderer } from "../view/threejs/index.js";
import { createViewSync, syncWorldTree } from "../view/sync.js";
import { sunScene, spaceshipScene } from "../game/toy-ship/scenes.js";
import { createOrbitSystem } from "../game/toy-ship/systems.js";

// --- Scenes ---

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

// Camera 1: top-down orthographic (original view)
const camera1Scene = createNode("node", {}, [
  createNode("transform", { position: [0, 20, 0] }),
  createNode("renderer", {}, [
    createNode("camera", {
      projection: "orthographic",
      near: 0.1,
      far: 100,
      zoom: 1,
      renderTarget: "browser",
    }),
  ]),
]);

// Camera 2: perspective from the side
const camera2Scene = createNode("node", {}, [
  createNode("transform", { position: [15, 8, 15] }),
  createNode("renderer", {}, [
    createNode("camera", {
      projection: "perspective",
      fov: 60,
      near: 0.1,
      far: 100,
      renderTarget: "browser",
    }),
  ]),
]);

// --- Bootstrap ---

async function main() {
  const container = document.getElementById("game")!;

  const renderer = new ThreeJSRenderer();
  await renderer.init(container);

  const sceneRegistry = createSceneRegistry();
  const sunSceneId = registerScene(sceneRegistry, sunScene);
  const shipSceneId = registerScene(sceneRegistry, spaceshipScene);
  const lightSceneId = registerScene(sceneRegistry, lightScene);
  const ambientSceneId = registerScene(sceneRegistry, ambientScene);
  const cam1SceneId = registerScene(sceneRegistry, camera1Scene);
  const cam2SceneId = registerScene(sceneRegistry, camera2Scene);

  // World setup
  const spaceNode = createWorldNode();

  instantiateScene(spaceNode.world, sceneRegistry, sunScene, sunSceneId, {
    position: [0, 0, 0],
  });

  const shipEntity = instantiateScene(spaceNode.world, sceneRegistry, spaceshipScene, shipSceneId, {
    position: [5, 0, 0],
  });
  const shipEntityIdx = getIndex(shipEntity);

  instantiateScene(spaceNode.world, sceneRegistry, lightScene, lightSceneId);
  instantiateScene(spaceNode.world, sceneRegistry, ambientScene, ambientSceneId);
  instantiateScene(spaceNode.world, sceneRegistry, camera1Scene, cam1SceneId);
  instantiateScene(spaceNode.world, sceneRegistry, camera2Scene, cam2SceneId);

  addSystem(spaceNode.world, "update", createOrbitSystem(shipEntityIdx));

  const viewSync = createViewSync(renderer, sceneRegistry);

  window.addEventListener("resize", () => {
    renderer.resize(container.clientWidth, container.clientHeight);
  });

  console.log("Setup complete, starting loop");

  // --- Game loop with split screen ---
  let lastTime = performance.now();

  function loop(now: number) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    tickWorldTree(spaceNode, dt);

    renderer.beginFrame();
    syncWorldTree(viewSync, spaceNode);

    // Collect camera handles
    const cameraHandles: number[] = [];
    for (const [, worldState] of viewSync.state.worlds) {
      for (const [, camHandle] of worldState.entityCamera) {
        cameraHandles.push(camHandle);
      }
    }

    console.log("Frame: cameras=" + cameraHandles.length);

    if (cameraHandles.length >= 2) {
      // Split screen: left half = camera 1, right half = camera 2

      // Camera 1 (top-down) — left half
      renderer.setViewport(0, 0, 0.5, 1);
      renderer.setActiveCamera(cameraHandles[0]!);
      renderer.lookAt(cameraHandles[0]!, 0, 0, 0);
      renderer.render();

      // Camera 2 (perspective) — right half
      renderer.setViewport(0.5, 0, 0.5, 1);
      renderer.setActiveCamera(cameraHandles[1]!);
      renderer.lookAt(cameraHandles[1]!, 0, 0, 0);
      renderer.render();

      renderer.resetViewport();
    } else if (cameraHandles.length === 1) {
      // Fallback: single camera
      renderer.setActiveCamera(cameraHandles[0]!);
      renderer.lookAt(cameraHandles[0]!, 0, 0, 0);
      renderer.render();
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main().catch((e) => console.error("MAIN ERROR:", e));
