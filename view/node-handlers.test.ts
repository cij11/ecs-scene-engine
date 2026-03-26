import { describe, it, expect } from "vitest";
import { handleNode } from "./node-handlers.js";
import type { LightParams, CameraParams } from "./renderer.js";
import { createNode } from "../engine/scene/node.js";

describe("Node type handlers", () => {
  it("handles mesh nodes", () => {
    const node = createNode("mesh", { geometry: "./meshes/ship", color: 0xff0000, roughness: 0.8 });
    const params = handleNode(node);

    expect(params).toEqual({
      type: "mesh",
      geometryRef: "./meshes/ship",
      color: 0xff0000,
      roughness: 0.8,
      metalness: undefined,
    });
  });

  it("handles light nodes", () => {
    const node = createNode("light", { lightType: "directional", color: 0xffffff, intensity: 2 });
    const params = handleNode(node);

    expect(params).toEqual({
      type: "light",
      lightType: "directional",
      color: 0xffffff,
      intensity: 2,
      range: undefined,
      angle: undefined,
    });
  });

  it("defaults light type to point", () => {
    const node = createNode("light", { intensity: 1 });
    const params = handleNode(node);

    expect(params!.type).toBe("light");
    expect((params as LightParams).lightType).toBe("point");
  });

  it("handles camera nodes", () => {
    const node = createNode("camera", { projection: "perspective", fov: 90, near: 0.5, far: 500 });
    const params = handleNode(node);

    expect(params).toEqual({
      type: "camera",
      projection: "perspective",
      fov: 90,
      near: 0.5,
      far: 500,
      zoom: undefined,
    });
  });

  it("defaults camera projection to perspective", () => {
    const node = createNode("camera", {});
    const params = handleNode(node);

    expect((params as CameraParams).projection).toBe("perspective");
  });

  it("returns null for unknown node types", () => {
    const node = createNode("transform", { x: 10 });
    expect(handleNode(node)).toBeNull();
  });

  it("returns null for generic node type", () => {
    const node = createNode("node", {});
    expect(handleNode(node)).toBeNull();
  });
});
