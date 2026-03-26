/**
 * Node — the fundamental building block.
 *
 * Nodes are static typed data containers arranged in a hierarchy.
 * They define structure and default properties. Never mutated at runtime.
 */

export type NodeType =
  | "node"
  | "transform"
  | "body"
  | "renderer"
  | "mesh"
  | "light"
  | "camera"
  | "ecs"
  | "sceneSpawner"
  | "scene";

export interface NodeData {
  [key: string]: unknown;
}

export interface SceneNode {
  type: NodeType;
  data: NodeData;
  children: SceneNode[];
}

export function createNode(
  type: NodeType,
  data: NodeData = {},
  children: SceneNode[] = [],
): SceneNode {
  return { type, data, children };
}

/** Walk a node tree depth-first, calling visitor on each node */
export function walkNodes(
  root: SceneNode,
  visitor: (node: SceneNode, depth: number) => void,
  depth: number = 0,
): void {
  visitor(root, depth);
  for (const child of root.children) {
    walkNodes(child, visitor, depth + 1);
  }
}

/** Find all nodes of a specific type in a tree */
export function findNodesByType(root: SceneNode, type: NodeType): SceneNode[] {
  const results: SceneNode[] = [];
  walkNodes(root, (node) => {
    if (node.type === type) results.push(node);
  });
  return results;
}

/** Find all rendering nodes — the subtree under any "renderer" node */
export function findRenderingNodes(root: SceneNode): SceneNode[] {
  const results: SceneNode[] = [];
  let inRenderer = false;

  const walk = (node: SceneNode): void => {
    const wasInRenderer = inRenderer;
    if (node.type === "renderer") {
      inRenderer = true;
    }
    if (inRenderer && node.type !== "renderer") {
      results.push(node);
    }
    for (const child of node.children) {
      walk(child);
    }
    inRenderer = wasInRenderer;
  };

  walk(root);
  return results;
}
