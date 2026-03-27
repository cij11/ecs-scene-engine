/**
 * Nested view demo — a TV in a scene.
 *
 * A "TV camera" renders the scene from one angle to an offscreen texture.
 * A RenderQuad in the main scene displays that texture.
 * The main camera sees the RenderQuad (the TV) along with the rest of the scene.
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
import type { CameraInfo, QuadInfo } from "../view/render-loop.js";
import { renderFrame } from "../view/render-loop.js";

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

// Main camera: perspective, looking at the scene from the side
const mainCameraScene = createNode("node", {}, [
  createNode("transform", { position: [12, 8, 12] }),
  createNode("renderer", {}, [
    createNode("camera", {
      projection: "perspective",
      fov: 60,
      near: 0.1,
      far: 100,
      renderTarget: "browser",
      backgroundColor: 0x1a1a2e,
    }),
  ]),
]);

// TV camera: top-down orthographic, renders to texture
const tvCameraScene = createNode("node", {}, [
  createNode("transform", { position: [0, 20, 0] }),
  createNode("renderer", {}, [
    createNode("camera", {
      projection: "orthographic",
      near: 0.1,
      far: 100,
      zoom: 1,
      renderTarget: "tv-feed",
      backgroundColor: 0x0a2a0a,
    }),
  ]),
]);

// TV screen: a RenderQuad that displays the tv-feed texture
const tvScreenScene = createNode("node", {}, [
  createNode("transform", { position: [-5, 3, 0] }),
  createNode("renderer", {}, [
    createNode("renderQuad", {
      renderTarget: "tv-feed",
      width: 6,
      height: 4,
    }),
  ]),
]);

// --- Bootstrap ---

async function main() {
  const container = document.getElementById("game")!;

  const renderer = new ThreeJSRenderer();
  await renderer.init(container);

  // Create render target for TV feed
  renderer.createRenderTarget("tv-feed", 512, 512);

  const sceneRegistry = createSceneRegistry();
  const sunSceneId = registerScene(sceneRegistry, sunScene);
  const shipSceneId = registerScene(sceneRegistry, spaceshipScene);
  const lightSceneId = registerScene(sceneRegistry, lightScene);
  const ambientSceneId = registerScene(sceneRegistry, ambientScene);
  const mainCamId = registerScene(sceneRegistry, mainCameraScene);
  const tvCamId = registerScene(sceneRegistry, tvCameraScene);
  const tvScreenId = registerScene(sceneRegistry, tvScreenScene);

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
  instantiateScene(spaceNode.world, sceneRegistry, mainCameraScene, mainCamId);
  instantiateScene(spaceNode.world, sceneRegistry, tvCameraScene, tvCamId);
  instantiateScene(spaceNode.world, sceneRegistry, tvScreenScene, tvScreenId);

  addSystem(spaceNode.world, "update", createOrbitSystem(shipEntityIdx));

  const viewSync = createViewSync(renderer, sceneRegistry);

  window.addEventListener("resize", () => {
    renderer.resize(container.clientWidth, container.clientHeight);
  });

  // --- Game loop ---
  let lastTime = performance.now();

  function loop(now: number) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    tickWorldTree(spaceNode, dt);

    renderer.beginFrame();
    syncWorldTree(viewSync, spaceNode);

    // Collect cameras and quads from sync state
    const cameras: CameraInfo[] = [];
    const quads: QuadInfo[] = [];

    for (const [, worldState] of viewSync.state.worlds) {
      for (const [, cam] of worldState.entityCamera) {
        cameras.push({
          handle: cam.handle,
          renderTarget: cam.renderTarget,
          recursionDepth: 0,
        });
      }
      for (const [, quad] of worldState.entityRenderQuad) {
        quads.push({ handle: quad.handle, renderTarget: quad.renderTarget });
      }
    }

    for (const cam of cameras) {
      renderer.lookAt(cam.handle, 0, 0, 0);
    }

    renderFrame(renderer, cameras, quads);

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main().catch((e) => console.error("MAIN ERROR:", e));
