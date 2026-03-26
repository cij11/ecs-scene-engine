import { describe, it, expect } from "vitest";
import { createPipeline, insertSystem, removeSystem, tickPipeline } from "./system.js";

describe("Pipeline", () => {
  it("executes systems in phase order", () => {
    const pipeline = createPipeline();
    const order: string[] = [];

    insertSystem(pipeline, "postUpdate", () => order.push("postUpdate"));
    insertSystem(pipeline, "preUpdate", () => order.push("preUpdate"));
    insertSystem(pipeline, "update", () => order.push("update"));
    insertSystem(pipeline, "cleanup", () => order.push("cleanup"));
    insertSystem(pipeline, "preRender", () => order.push("preRender"));

    tickPipeline(pipeline, {}, 16);

    expect(order).toEqual(["preUpdate", "update", "postUpdate", "preRender", "cleanup"]);
  });

  it("executes systems within a phase in insertion order", () => {
    const pipeline = createPipeline();
    const order: string[] = [];

    insertSystem(pipeline, "update", () => order.push("A"));
    insertSystem(pipeline, "update", () => order.push("B"));
    insertSystem(pipeline, "update", () => order.push("C"));

    tickPipeline(pipeline, {}, 16);

    expect(order).toEqual(["A", "B", "C"]);
  });

  it("passes world and dt to systems", () => {
    const pipeline = createPipeline();
    let receivedWorld: unknown;
    let receivedDt: number = 0;

    insertSystem(pipeline, "update", (world, dt) => {
      receivedWorld = world;
      receivedDt = dt;
    });

    const world = { name: "test" };
    tickPipeline(pipeline, world, 0.016);

    expect(receivedWorld).toBe(world);
    expect(receivedDt).toBeCloseTo(0.016);
  });

  it("removes a system", () => {
    const pipeline = createPipeline();
    const order: string[] = [];

    const systemB = () => order.push("B");
    insertSystem(pipeline, "update", () => order.push("A"));
    insertSystem(pipeline, "update", systemB);
    insertSystem(pipeline, "update", () => order.push("C"));

    expect(removeSystem(pipeline, "update", systemB)).toBe(true);
    tickPipeline(pipeline, {}, 16);

    expect(order).toEqual(["A", "C"]);
  });

  it("returns false when removing a non-existent system", () => {
    const pipeline = createPipeline();
    const result = removeSystem(pipeline, "update", () => {});
    expect(result).toBe(false);
  });

  it("runs no systems on an empty pipeline", () => {
    const pipeline = createPipeline();
    // Should not throw
    tickPipeline(pipeline, {}, 16);
  });
});
