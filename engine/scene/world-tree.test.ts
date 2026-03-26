import { describe, it, expect, beforeEach } from "vitest";
import {
  createWorldNode,
  addChildWorld,
  removeChildWorld,
  tickWorldTree,
  flattenWorldTree,
} from "./world-tree.js";
import { resetComponentIdCounter } from "../ecs/component.js";
import { addEntity, addComponent, addSystem, getComponent } from "../ecs/world.js";
import { Transform } from "../ecs/components/transform.js";
import { Velocity } from "../ecs/components/velocity.js";
import { movementSystem } from "../ecs/systems/movement.js";

beforeEach(() => {
  resetComponentIdCounter();
});

describe("WorldTree", () => {
  it("creates a world node with an empty world", () => {
    const node = createWorldNode();
    expect(node.world).toBeDefined();
    expect(node.children).toEqual([]);
  });

  it("adds and removes child worlds", () => {
    const parent = createWorldNode();
    const child = createWorldNode();

    addChildWorld(parent, child);
    expect(parent.children.length).toBe(1);
    expect(parent.children[0]).toBe(child);

    expect(removeChildWorld(parent, child)).toBe(true);
    expect(parent.children.length).toBe(0);
  });

  it("stores parent entity index on child", () => {
    const parent = createWorldNode();
    const child = createWorldNode();

    addChildWorld(parent, child, 42);
    expect(child.parentEntityIndex).toBe(42);
  });

  it("ticks root before children", () => {
    const order: string[] = [];

    const root = createWorldNode();
    const child1 = createWorldNode();
    const child2 = createWorldNode();

    addChildWorld(root, child1);
    addChildWorld(root, child2);

    // Add systems that record tick order
    addSystem(root.world, "update", () => order.push("root"));
    addSystem(child1.world, "update", () => order.push("child1"));
    addSystem(child2.world, "update", () => order.push("child2"));

    tickWorldTree(root, 0.016);

    expect(order).toEqual(["root", "child1", "child2"]);
  });

  it("ticks grandchildren after children", () => {
    const order: string[] = [];

    const root = createWorldNode();
    const child = createWorldNode();
    const grandchild = createWorldNode();

    addChildWorld(root, child);
    addChildWorld(child, grandchild);

    addSystem(root.world, "update", () => order.push("root"));
    addSystem(child.world, "update", () => order.push("child"));
    addSystem(grandchild.world, "update", () => order.push("grandchild"));

    tickWorldTree(root, 0.016);

    expect(order).toEqual(["root", "child", "grandchild"]);
  });

  it("entities in different worlds are independent", () => {
    const root = createWorldNode();
    const child = createWorldNode();
    addChildWorld(root, child);

    // Add movement to both worlds
    addSystem(root.world, "update", movementSystem);
    addSystem(child.world, "update", movementSystem);

    // Entity in root moves right
    const e1 = addEntity(root.world);
    addComponent(root.world, e1, Transform, {
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
    addComponent(root.world, e1, Velocity, { vx: 10, vy: 0, vz: 0 });

    // Entity in child moves up
    const e2 = addEntity(child.world);
    addComponent(child.world, e2, Transform, {
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
    addComponent(child.world, e2, Velocity, { vx: 0, vy: 5, vz: 0 });

    tickWorldTree(root, 1);

    expect(getComponent(root.world, Transform, e1)!.px).toBeCloseTo(10);
    expect(getComponent(root.world, Transform, e1)!.py).toBeCloseTo(0);

    expect(getComponent(child.world, Transform, e2)!.px).toBeCloseTo(0);
    expect(getComponent(child.world, Transform, e2)!.py).toBeCloseTo(5);
  });

  it("calls onAfterTick callback between parent and children", () => {
    const callbacks: string[] = [];

    const root = createWorldNode();
    const child = createWorldNode();
    addChildWorld(root, child);

    addSystem(root.world, "update", () => callbacks.push("root-tick"));
    addSystem(child.world, "update", () => callbacks.push("child-tick"));

    tickWorldTree(root, 0.016, (node) => {
      if (node === root) callbacks.push("root-after");
      if (node === child) callbacks.push("child-after");
    });

    expect(callbacks).toEqual(["root-tick", "root-after", "child-tick", "child-after"]);
  });

  it("flattens world tree in root-to-leaf order", () => {
    const root = createWorldNode();
    const child1 = createWorldNode();
    const child2 = createWorldNode();
    const grandchild = createWorldNode();

    addChildWorld(root, child1);
    addChildWorld(root, child2);
    addChildWorld(child1, grandchild);

    const flat = flattenWorldTree(root);
    expect(flat).toEqual([root, child1, grandchild, child2]);
  });
});
