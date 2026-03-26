import { describe, it, expect } from "vitest";
import {
  ThreeJSRenderer,
  createViewSync,
  syncWorld,
  Transform,
  handleNode,
  registerNodeHandler,
} from "./index.js";

describe("view/index.ts barrel export", () => {
  it("exports all public API", () => {
    expect(ThreeJSRenderer).toBeTypeOf("function");
    expect(createViewSync).toBeTypeOf("function");
    expect(syncWorld).toBeTypeOf("function");
    expect(Transform).toBeDefined();
    expect(Transform.schema).toBeDefined();
    expect(handleNode).toBeTypeOf("function");
    expect(registerNodeHandler).toBeTypeOf("function");
  });
});
