import { describe, it, expect, beforeEach } from "vitest";
import {
  createNode,
  findNodesByType,
  findRenderingNodes,
  walkNodes,
} from "./node.js";
import {
  createSceneRegistry,
  registerScene,
  getScene,
  lookupVisualNodes,
} from "./registry.js";
import { SceneRef } from "../core-components/scene-ref.js";
import { resetComponentIdCounter } from "../ecs/component.js";
import {
  createWorld,
  addEntity,
  addComponent,
  getComponent,
} from "../ecs/world.js";

beforeEach(() => {
  resetComponentIdCounter();
});

describe("Node", () => {
  it("creates a node with type and data", () => {
    const node = createNode("transform", { x: 10, y: 20, z: 0 });
    expect(node.type).toBe("transform");
    expect(node.data.x).toBe(10);
    expect(node.children).toEqual([]);
  });

  it("creates nested node hierarchies", () => {
    const tree = createNode("node", {}, [
      createNode("transform", { x: 10 }),
      createNode("renderer", {}, [
        createNode("mesh", { geometry: "./meshes/ship" }),
      ]),
    ]);
    expect(tree.children.length).toBe(2);
    expect(tree.children[1]!.children[0]!.type).toBe("mesh");
  });

  it("walks nodes depth-first", () => {
    const tree = createNode("node", {}, [
      createNode("transform"),
      createNode("renderer", {}, [
        createNode("mesh"),
      ]),
    ]);

    const visited: string[] = [];
    walkNodes(tree, (node) => visited.push(node.type));

    expect(visited).toEqual(["node", "transform", "renderer", "mesh"]);
  });

  it("finds nodes by type", () => {
    const tree = createNode("node", {}, [
      createNode("transform"),
      createNode("body"),
      createNode("renderer", {}, [
        createNode("mesh"),
        createNode("light"),
      ]),
    ]);

    expect(findNodesByType(tree, "mesh").length).toBe(1);
    expect(findNodesByType(tree, "light").length).toBe(1);
    expect(findNodesByType(tree, "camera").length).toBe(0);
  });

  it("finds rendering nodes under renderer subtree", () => {
    const tree = createNode("node", {}, [
      createNode("transform", { x: 10 }),
      createNode("body", { mass: 1 }),
      createNode("renderer", {}, [
        createNode("mesh", { geometry: "./ship" }),
        createNode("light", { type: "point" }),
      ]),
    ]);

    const renderNodes = findRenderingNodes(tree);
    expect(renderNodes.length).toBe(2);
    expect(renderNodes[0]!.type).toBe("mesh");
    expect(renderNodes[1]!.type).toBe("light");
  });

  it("returns empty for scene with no renderer", () => {
    const tree = createNode("node", {}, [
      createNode("transform"),
      createNode("body"),
    ]);

    expect(findRenderingNodes(tree)).toEqual([]);
  });
});

describe("SceneRegistry", () => {
  it("registers and retrieves scenes", () => {
    const registry = createSceneRegistry();
    const tree = createNode("node", {}, [
      createNode("transform", { x: 5 }),
    ]);

    const id = registerScene(registry, tree);
    const retrieved = getScene(registry, id);

    expect(retrieved).toBe(tree);
  });

  it("assigns unique IDs", () => {
    const registry = createSceneRegistry();
    const id1 = registerScene(registry, createNode("node"));
    const id2 = registerScene(registry, createNode("node"));

    expect(id1).not.toBe(id2);
  });

  it("looks up visual nodes by scene ID", () => {
    const registry = createSceneRegistry();
    const tree = createNode("node", {}, [
      createNode("transform"),
      createNode("renderer", {}, [
        createNode("mesh", { geometry: "./ball" }),
      ]),
    ]);

    const id = registerScene(registry, tree);
    const visuals = lookupVisualNodes(registry, id);

    expect(visuals.length).toBe(1);
    expect(visuals[0]!.type).toBe("mesh");
    expect(visuals[0]!.data.geometry).toBe("./ball");
  });

  it("returns empty for unknown scene ID", () => {
    const registry = createSceneRegistry();
    expect(lookupVisualNodes(registry, 999)).toEqual([]);
  });
});

describe("ComponentSceneRef", () => {
  it("links an entity to a scene ID", () => {
    const world = createWorld();
    const registry = createSceneRegistry();

    const tree = createNode("node", {}, [
      createNode("renderer", {}, [
        createNode("mesh", { geometry: "./ship" }),
      ]),
    ]);
    const sceneId = registerScene(registry, tree);

    const entity = addEntity(world);
    addComponent(world, entity, SceneRef, { sceneId });

    const ref = getComponent(world, SceneRef, entity);
    expect(ref!.sceneId).toBe(sceneId);

    const visuals = lookupVisualNodes(registry, ref!.sceneId);
    expect(visuals[0]!.data.geometry).toBe("./ship");
  });
});
