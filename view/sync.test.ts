import { describe, it, expect } from "vitest";
import { createViewSync, syncWorld, Transform } from "./sync.js";
import { SceneRef } from "../engine/core-components/scene-ref.js";
import {
  createWorld,
  addEntity,
  addComponent,
  removeEntity,
  getStore,
} from "../engine/ecs/world.js";
import { getIndex } from "../engine/ecs/entity.js";
import { createSceneRegistry, registerScene } from "../engine/scene/registry.js";
import { createNode } from "../engine/scene/node.js";
import type { Renderer, RenderHandle, RenderObjectParams, RenderTransform } from "./renderer.js";

/** Mock renderer that records all calls */
function createMockRenderer() {
  const created: { handle: RenderHandle; params: RenderObjectParams }[] = [];
  const updated: { handle: RenderHandle; transform: RenderTransform }[] = [];
  const removed: RenderHandle[] = [];
  let activeCam: RenderHandle | null = null;
  let nextHandle = 1;

  const renderer: Renderer = {
    init: async () => {},
    createObject(params) {
      const handle = nextHandle++;
      created.push({ handle, params });
      return handle;
    },
    updateTransform(handle, transform) {
      updated.push({ handle, transform });
    },
    removeObject(handle) {
      removed.push(handle);
    },
    setActiveCamera(handle) {
      activeCam = handle;
    },
    lookAt() {},
    beginFrame() {},
    endFrame() {},
    resize() {},
    destroy() {},
  };

  return { renderer, created, updated, removed, getActiveCam: () => activeCam };
}

// SceneRef and Transform use the component ID counter, so we need
// to import them BEFORE resetting — they're module-level singletons.
// Instead we just ensure tests are isolated by creating fresh worlds.

describe("View Sync", () => {
  it("creates renderer objects for entities with SceneRef + Transform", () => {
    const mock = createMockRenderer();
    const sceneRegistry = createSceneRegistry();
    const sync = createViewSync(mock.renderer, sceneRegistry);

    const scene = createNode("node", {}, [
      createNode("renderer", {}, [createNode("mesh", { color: 0xff0000 })]),
    ]);
    const sceneId = registerScene(sceneRegistry, scene);

    const world = createWorld();
    const e = addEntity(world);
    addComponent(world, e, Transform, {
      px: 10,
      py: 20,
      pz: 30,
      rx: 0,
      ry: 0,
      rz: 0,
      rw: 1,
      sx: 1,
      sy: 1,
      sz: 1,
    });
    addComponent(world, e, SceneRef, { sceneId });

    syncWorld(sync, world);

    expect(mock.created.length).toBe(1);
    expect(mock.created[0]!.params.type).toBe("mesh");
    expect(mock.updated.length).toBe(1);
    expect(mock.updated[0]!.transform.px).toBe(10);
  });

  it("updates transforms on subsequent syncs", () => {
    const mock = createMockRenderer();
    const sceneRegistry = createSceneRegistry();
    const sync = createViewSync(mock.renderer, sceneRegistry);

    const scene = createNode("node", {}, [createNode("renderer", {}, [createNode("mesh")])]);
    const sceneId = registerScene(sceneRegistry, scene);

    const world = createWorld();
    const e = addEntity(world);
    addComponent(world, e, Transform, {
      px: 0,
      py: 0,
      pz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      rw: 1,
      sx: 1,
      sy: 1,
      sz: 1,
    });
    addComponent(world, e, SceneRef, { sceneId });

    syncWorld(sync, world);
    expect(mock.created.length).toBe(1);

    // Update transform in ECS
    const store = getStore(world, Transform)!;
    const idx = getIndex(e);
    store.px[idx] = 99;

    syncWorld(sync, world);

    // Should not create again, just update
    expect(mock.created.length).toBe(1);
    expect(mock.updated.length).toBe(2);
    expect(mock.updated[1]!.transform.px).toBe(99);
  });

  it("removes renderer objects when entity is destroyed", () => {
    const mock = createMockRenderer();
    const sceneRegistry = createSceneRegistry();
    const sync = createViewSync(mock.renderer, sceneRegistry);

    const scene = createNode("node", {}, [createNode("renderer", {}, [createNode("mesh")])]);
    const sceneId = registerScene(sceneRegistry, scene);

    const world = createWorld();
    const e = addEntity(world);
    addComponent(world, e, Transform, {
      px: 0,
      py: 0,
      pz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      rw: 1,
      sx: 1,
      sy: 1,
      sz: 1,
    });
    addComponent(world, e, SceneRef, { sceneId });

    syncWorld(sync, world);
    expect(mock.created.length).toBe(1);

    removeEntity(world, e);
    syncWorld(sync, world);

    expect(mock.removed.length).toBe(1);
    expect(mock.removed[0]).toBe(mock.created[0]!.handle);
  });

  it("ignores entities without SceneRef", () => {
    const mock = createMockRenderer();
    const sceneRegistry = createSceneRegistry();
    const sync = createViewSync(mock.renderer, sceneRegistry);

    const world = createWorld();
    const e = addEntity(world);
    addComponent(world, e, Transform, {
      px: 0,
      py: 0,
      pz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      rw: 1,
      sx: 1,
      sy: 1,
      sz: 1,
    });

    syncWorld(sync, world);
    expect(mock.created.length).toBe(0);
  });

  it("sets active camera for camera nodes", () => {
    const mock = createMockRenderer();
    const sceneRegistry = createSceneRegistry();
    const sync = createViewSync(mock.renderer, sceneRegistry);

    const scene = createNode("node", {}, [
      createNode("renderer", {}, [createNode("camera", { projection: "perspective", fov: 90 })]),
    ]);
    const sceneId = registerScene(sceneRegistry, scene);

    const world = createWorld();
    const e = addEntity(world);
    addComponent(world, e, Transform, {
      px: 0,
      py: 5,
      pz: 10,
      rx: 0,
      ry: 0,
      rz: 0,
      rw: 1,
      sx: 1,
      sy: 1,
      sz: 1,
    });
    addComponent(world, e, SceneRef, { sceneId });

    syncWorld(sync, world);

    expect(mock.created.length).toBe(1);
    expect(mock.created[0]!.params.type).toBe("camera");
    expect(mock.getActiveCam()).toBe(mock.created[0]!.handle);
  });

  it("handles scene with multiple rendering nodes", () => {
    const mock = createMockRenderer();
    const sceneRegistry = createSceneRegistry();
    const sync = createViewSync(mock.renderer, sceneRegistry);

    const scene = createNode("node", {}, [
      createNode("renderer", {}, [
        createNode("mesh", { color: 0xff0000 }),
        createNode("light", { lightType: "point" }),
      ]),
    ]);
    const sceneId = registerScene(sceneRegistry, scene);

    const world = createWorld();
    const e = addEntity(world);
    addComponent(world, e, Transform, {
      px: 0,
      py: 0,
      pz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      rw: 1,
      sx: 1,
      sy: 1,
      sz: 1,
    });
    addComponent(world, e, SceneRef, { sceneId });

    syncWorld(sync, world);

    expect(mock.created.length).toBe(2);
    expect(mock.created[0]!.params.type).toBe("mesh");
    expect(mock.created[1]!.params.type).toBe("light");
    // Both get the same transform
    expect(mock.updated.length).toBe(2);
  });
});
