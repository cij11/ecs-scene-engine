/**
 * World tree — manages a hierarchy of ECS worlds.
 *
 * Each WorldNode wraps a World and can have child WorldNodes.
 * Worlds tick root-to-leaf. Parent is authoritative.
 */

import type { World } from "../ecs/world.js";
import { createWorld, tick as tickWorld } from "../ecs/world.js";

export interface WorldNode {
  world: World;
  children: WorldNode[];
  /** Parent entity index in the parent world (for transform propagation) */
  parentEntityIndex?: number;
}

export function createWorldNode(capacity?: number): WorldNode {
  return {
    world: createWorld(capacity),
    children: [],
  };
}

export function addChildWorld(
  parent: WorldNode,
  child: WorldNode,
  parentEntityIndex?: number,
): void {
  child.parentEntityIndex = parentEntityIndex;
  parent.children.push(child);
}

export function removeChildWorld(parent: WorldNode, child: WorldNode): boolean {
  const idx = parent.children.indexOf(child);
  if (idx === -1) return false;
  parent.children.splice(idx, 1);
  return true;
}

/**
 * Tick the entire world tree, root-to-leaf.
 *
 * An optional callback fires after each world ticks,
 * before its children tick — used for transform propagation.
 */
export function tickWorldTree(
  root: WorldNode,
  dt: number,
  onAfterTick?: (node: WorldNode) => void,
): void {
  tickWorld(root.world, dt);
  onAfterTick?.(root);

  for (const child of root.children) {
    tickWorldTree(child, dt, onAfterTick);
  }
}

/** Collect all worlds in the tree (root-to-leaf order) */
export function flattenWorldTree(root: WorldNode): WorldNode[] {
  const result: WorldNode[] = [root];
  for (const child of root.children) {
    result.push(...flattenWorldTree(child));
  }
  return result;
}
