/**
 * Hall of mirrors demo — a camera sees its own output on a RenderQuad.
 *
 * The camera renders to "mirror-view" texture. A RenderQuad displays
 * "mirror-view". The camera can see the quad, creating recursion.
 * recursionDepth controls how many iterative passes to render.
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

// Mirror camera: same position as browser, renders to texture
const mirrorCameraScene = createNode("node", {}, [
  createNode("transform", { position: [10, 6, 10] }),
  createNode("renderer", {}, [
    createNode("camera", {
      projection: "perspective",
      fov: 60,
      near: 0.1,
      far: 100,
      renderTarget: "mirror-view",
      backgroundColor: 0x1a2e1a,
      recursionDepth: 3,
    }),
  ]),
]);

// Browser camera: same position, renders to screen
const browserCameraScene = createNode("node", {}, [
  createNode("transform", { position: [10, 6, 10] }),
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

// Mirror quad
const mirrorScene = createNode("node", {}, [
  createNode("transform", { position: [-4, 3, 0] }),
  createNode("renderer", {}, [
    createNode("renderQuad", {
      renderTarget: "mirror-view",
      width: 8,
      height: 5,
    }),
  ]),
]);

// --- Bootstrap ---

async function main() {
  const container = document.getElementById("game")!;

  const renderer = new ThreeJSRenderer();
  await renderer.init(container);

  renderer.createRenderTarget("mirror-view", 512, 512);

  const sceneRegistry = createSceneRegistry();
  const sunSceneId = registerScene(sceneRegistry, sunScene);
  const shipSceneId = registerScene(sceneRegistry, spaceshipScene);
  const lightSceneId = registerScene(sceneRegistry, lightScene);
  const ambientSceneId = registerScene(sceneRegistry, ambientScene);
  const mirrorCamId = registerScene(sceneRegistry, mirrorCameraScene);
  const browserCamId = registerScene(sceneRegistry, browserCameraScene);
  const mirrorId = registerScene(sceneRegistry, mirrorScene);

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
  instantiateScene(spaceNode.world, sceneRegistry, mirrorCameraScene, mirrorCamId);
  instantiateScene(spaceNode.world, sceneRegistry, browserCameraScene, browserCamId);
  instantiateScene(spaceNode.world, sceneRegistry, mirrorScene, mirrorId);

  addSystem(spaceNode.world, "update", createOrbitSystem(shipEntityIdx));

  const viewSync = createViewSync(renderer, sceneRegistry);

  window.addEventListener("resize", () => {
    renderer.resize(container.clientWidth, container.clientHeight);
  });

  let lastTime = performance.now();

  function loop(now: number) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    tickWorldTree(spaceNode, dt);

    renderer.beginFrame();
    syncWorldTree(viewSync, spaceNode);

    const cameras: CameraInfo[] = [];
    const quads: QuadInfo[] = [];

    for (const [, worldState] of viewSync.state.worlds) {
      for (const [, cam] of worldState.entityCamera) {
        cameras.push({
          handle: cam.handle,
          renderTarget: cam.renderTarget,
          recursionDepth: cam.renderTarget === "mirror-view" ? 3 : 0,
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
