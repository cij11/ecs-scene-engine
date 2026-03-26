/**
 * Scene registry — maps scene IDs to their static node trees.
 *
 * Scenes are registered once at startup. The registry is read-only
 * at runtime — used by the ECS for instantiation and by the view
 * for visual node lookup.
 */

import type { SceneNode } from "./node.js";
import { findRenderingNodes } from "./node.js";

export type SceneId = number;

export interface SceneRegistry {
  scenes: Map<SceneId, SceneNode>;
  nextId: number;
}

export function createSceneRegistry(): SceneRegistry {
  return {
    scenes: new Map(),
    nextId: 0,
  };
}

export function registerScene(registry: SceneRegistry, root: SceneNode): SceneId {
  const id = registry.nextId++;
  registry.scenes.set(id, root);
  return id;
}

export function getScene(registry: SceneRegistry, id: SceneId): SceneNode | undefined {
  return registry.scenes.get(id);
}

export function lookupVisualNodes(registry: SceneRegistry, id: SceneId): SceneNode[] {
  const root = registry.scenes.get(id);
  if (!root) return [];
  return findRenderingNodes(root);
}
