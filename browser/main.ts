import {
  createWorld,
  addEntity,
  addComponent,
  addSystem,
  tick,
  getStore,
} from "../engine/ecs/world.js";
import { queryEntities } from "../engine/ecs/query.js";
import { SceneRef } from "../engine/core-components/scene-ref.js";
import { createSceneRegistry, registerScene } from "../engine/scene/registry.js";
import { createNode } from "../engine/scene/node.js";
import { ThreeJSRenderer } from "../view/threejs/index.js";
import { createViewSync, syncWorld, Transform } from "../view/sync.js";
import { query } from "../engine/ecs/world.js";

// --- Scene definitions (static node trees) ---

const cubeScene = createNode("node", {}, [
  createNode("transform"),
  createNode("renderer", {}, [
    createNode("mesh", { color: 0x4488ff, roughness: 0.4, metalness: 0.1 }),
  ]),
]);

const lightScene = createNode("node", {}, [
  createNode("transform"),
  createNode("renderer", {}, [
    createNode("light", { lightType: "point", color: 0xffffff, intensity: 50, range: 100 }),
  ]),
]);

const ambientScene = createNode("node", {}, [
  createNode("transform"),
  createNode("renderer", {}, [
    createNode("light", { lightType: "ambient", color: 0xffffff, intensity: 0.3 }),
  ]),
]);

const cameraScene = createNode("node", {}, [
  createNode("transform"),
  createNode("renderer", {}, [
    createNode("camera", { projection: "perspective", fov: 75, near: 0.1, far: 1000 }),
  ]),
]);

// --- Bootstrap ---

async function main() {
  const container = document.getElementById("game")!;

  // Init renderer
  const renderer = new ThreeJSRenderer();
  await renderer.init(container);

  // Register scenes
  const sceneRegistry = createSceneRegistry();
  const cubeId = registerScene(sceneRegistry, cubeScene);
  const lightId = registerScene(sceneRegistry, lightScene);
  const ambientId = registerScene(sceneRegistry, ambientScene);
  const cameraId = registerScene(sceneRegistry, cameraScene);

  // Create view sync
  const viewSync = createViewSync(renderer, sceneRegistry);

  // Create ECS world
  const world = createWorld();

  // Spawn a cube entity
  const cube = addEntity(world);
  addComponent(world, cube, Transform, {
    px: 0, py: 0, pz: 0,
    rx: 0, ry: 0, rz: 0, rw: 1,
    sx: 1, sy: 1, sz: 1,
  });
  addComponent(world, cube, SceneRef, { sceneId: cubeId });

  // Spawn a point light
  const light = addEntity(world);
  addComponent(world, light, Transform, {
    px: 5, py: 5, pz: 5,
    rx: 0, ry: 0, rz: 0, rw: 1,
    sx: 1, sy: 1, sz: 1,
  });
  addComponent(world, light, SceneRef, { sceneId: lightId });

  // Spawn ambient light
  const ambient = addEntity(world);
  addComponent(world, ambient, Transform, {
    px: 0, py: 0, pz: 0,
    rx: 0, ry: 0, rz: 0, rw: 1,
    sx: 1, sy: 1, sz: 1,
  });
  addComponent(world, ambient, SceneRef, { sceneId: ambientId });

  // Spawn camera
  const camera = addEntity(world);
  addComponent(world, camera, Transform, {
    px: 0, py: 2, pz: 5,
    rx: 0, ry: 0, rz: 0, rw: 1,
    sx: 1, sy: 1, sz: 1,
  });
  addComponent(world, camera, SceneRef, { sceneId: cameraId });

  // Add a rotation system — spins the cube
  const transformStore = getStore(world, Transform)!;
  const cubeQuery = query(world, [Transform, SceneRef]);

  addSystem(world, "update", (_w, dt) => {
    // Simple rotation: increment quaternion Y rotation
    for (const eid of queryEntities(cubeQuery)) {
      if (eid === 0) { // only rotate the cube (first entity)
        const angle = dt * 0.5;
        const cosA = Math.cos(angle / 2);
        const sinA = Math.sin(angle / 2);
        // Multiply current quaternion by Y-axis rotation
        const qx = transformStore.rx[eid]!;
        const qy = transformStore.ry[eid]!;
        const qz = transformStore.rz[eid]!;
        const qw = transformStore.rw[eid]!;
        transformStore.rx[eid] = qw * 0 + qx * cosA + qy * sinA * 0 - qz * sinA;
        transformStore.ry[eid] = qw * sinA + qy * cosA + qz * 0 - qx * 0;
        transformStore.rz[eid] = qw * 0 + qz * cosA + qx * sinA - qy * 0;
        transformStore.rw[eid] = qw * cosA - qx * 0 - qy * sinA - qz * 0;
      }
    }
  });

  // Handle resize
  window.addEventListener("resize", () => {
    renderer.resize(container.clientWidth, container.clientHeight);
  });

  // Game loop
  let lastTime = performance.now();

  function loop(now: number) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    tick(world, dt);

    renderer.beginFrame();
    syncWorld(viewSync, world);
    renderer.endFrame();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
