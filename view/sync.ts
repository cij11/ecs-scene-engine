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
import { SceneRef } from "../engine/core-components/scene-ref.js";
import { Transform } from "../engine/ecs/components/transform.js";
import type { SceneRegistry } from "../engine/scene/registry.js";
import { lookupVisualNodes } from "../engine/scene/registry.js";
import type { Renderer, RenderHandle, RenderTransform } from "./renderer.js";
import { handleNode } from "./node-handlers.js";
import type { WorldNode } from "../engine/scene/world-tree.js";
import { flattenWorldTree } from "../engine/scene/world-tree.js";
import { combineTransforms, type TransformData } from "../engine/scene/transform-propagation.js";

export { Transform };

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
 * Sync an entire world tree to the renderer.
 * Traverses root-to-leaf, propagating parent transforms to children.
 */
export function syncWorldTree(
  sync: ViewSync,
  root: WorldNode,
): void {
  syncWorldTreeNode(sync, root, undefined);
}

function syncWorldTreeNode(
  sync: ViewSync,
  node: WorldNode,
  parentTransform: TransformData | undefined,
): void {
  syncWorld(sync, node.world, parentTransform);

  // For each child world, find the parent entity's transform
  for (const child of node.children) {
    let childParentTransform: TransformData | undefined = parentTransform;

    if (child.parentEntityIndex !== undefined) {
      const tStore = getStore(node.world, Transform);
      if (tStore) {
        const eid = child.parentEntityIndex;
        const localT: TransformData = {
          px: tStore.px[eid]!, py: tStore.py[eid]!, pz: tStore.pz[eid]!,
          rx: tStore.rx[eid]!, ry: tStore.ry[eid]!, rz: tStore.rz[eid]!,
          rw: tStore.rw[eid]!,
          sx: tStore.sx[eid]!, sy: tStore.sy[eid]!, sz: tStore.sz[eid]!,
        };
        childParentTransform = parentTransform
          ? combineTransforms(parentTransform, localT)
          : localT;
      }
    }

    syncWorldTreeNode(sync, child, childParentTransform);
  }
}

/**
 * Sync a single world's renderable entities to the renderer.
 * Call once per frame after ticking the ECS.
 */
export function syncWorld(
  sync: ViewSync,
  world: World,
  parentTransform?: TransformData,
): void {
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

    // Build local transform
    const local: RenderTransform = {
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

    // Apply parent transform offset if in a child world
    const t = parentTransform
      ? combineTransforms(parentTransform, local)
      : local;

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
