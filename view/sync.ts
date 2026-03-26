/**
 * View sync layer — bridges ECS entities and the Renderer.
 *
 * Each frame, queries the ECS for entities with Transform + SceneRef,
 * looks up visual nodes from the static scene registry, and
 * creates/updates/removes renderer objects.
 */

import type { World } from "../engine/ecs/world.js";
import {
  query,
  getComponent,
  getStore,
  hasEntity,
} from "../engine/ecs/world.js";
import { queryEntities } from "../engine/ecs/query.js";
import { getIndex } from "../engine/ecs/entity.js";
import type { ComponentDef } from "../engine/ecs/component.js";
import { defineComponent } from "../engine/ecs/component.js";
import { SceneRef } from "../engine/core-components/scene-ref.js";
import type { SceneRegistry } from "../engine/scene/registry.js";
import { lookupVisualNodes } from "../engine/scene/registry.js";
import type { Renderer, RenderHandle, RenderTransform } from "./renderer.js";
import { handleNode } from "./node-handlers.js";

/** Core Transform component — used by both ECS and view */
export const Transform = defineComponent({
  px: Float32Array, py: Float32Array, pz: Float32Array,
  rx: Float32Array, ry: Float32Array, rz: Float32Array, rw: Float32Array,
  sx: Float32Array, sy: Float32Array, sz: Float32Array,
});

/** Tracks which entities have been synced to the renderer */
interface SyncState {
  /** entity index → list of render handles for that entity */
  entityHandles: Map<number, RenderHandle[]>;
  /** entity index → camera handle (if entity has a camera node) */
  entityCamera: Map<number, RenderHandle>;
}

export interface ViewSync {
  renderer: Renderer;
  sceneRegistry: SceneRegistry;
  state: SyncState;
}

export function createViewSync(
  renderer: Renderer,
  sceneRegistry: SceneRegistry,
): ViewSync {
  return {
    renderer,
    sceneRegistry,
    state: {
      entityHandles: new Map(),
      entityCamera: new Map(),
    },
  };
}

/**
 * Sync a world's renderable entities to the renderer.
 * Call once per frame after ticking the ECS.
 */
export function syncWorld(sync: ViewSync, world: World): void {
  const { renderer, sceneRegistry, state } = sync;

  const q = query(world, [Transform, SceneRef]);
  const entities = queryEntities(q);

  const transformStore = getStore(world, Transform);
  const sceneRefStore = getStore(world, SceneRef);

  if (!transformStore || !sceneRefStore) return;

  // Track which entities are still alive this frame
  const alive = new Set<number>();

  for (const entityIdx of entities) {
    alive.add(entityIdx);

    // Create renderer objects if this entity is new
    if (!state.entityHandles.has(entityIdx)) {
      const sceneId = sceneRefStore.sceneId[entityIdx]!;
      const visualNodes = lookupVisualNodes(sceneRegistry, sceneId);

      const handles: RenderHandle[] = [];
      for (const node of visualNodes) {
        const params = handleNode(node);
        if (params) {
          const handle = renderer.createObject(params);
          handles.push(handle);

          if (params.type === "camera") {
            state.entityCamera.set(entityIdx, handle);
            renderer.setActiveCamera(handle);
          }
        }
      }
      state.entityHandles.set(entityIdx, handles);
    }

    // Update transforms
    const t: RenderTransform = {
      px: transformStore.px[entityIdx]!,
      py: transformStore.py[entityIdx]!,
      pz: transformStore.pz[entityIdx]!,
      rx: transformStore.rx[entityIdx]!,
      ry: transformStore.ry[entityIdx]!,
      rz: transformStore.rz[entityIdx]!,
      rw: transformStore.rw[entityIdx]!,
      sx: transformStore.sx[entityIdx]!,
      sy: transformStore.sy[entityIdx]!,
      sz: transformStore.sz[entityIdx]!,
    };

    const handles = state.entityHandles.get(entityIdx)!;
    for (const handle of handles) {
      renderer.updateTransform(handle, t);
    }
  }

  // Remove renderer objects for entities that no longer exist
  for (const [entityIdx, handles] of state.entityHandles) {
    if (!alive.has(entityIdx)) {
      for (const handle of handles) {
        renderer.removeObject(handle);
      }
      state.entityHandles.delete(entityIdx);
      state.entityCamera.delete(entityIdx);
    }
  }
}
