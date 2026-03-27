import { describe, it, expect, beforeEach } from "vitest";
import type { Renderer, RenderHandle, RenderObjectParams } from "../renderer.js";

/**
 * A tracking renderer that records all render target and viewport operations.
 * Tests the API contract without needing WebGL.
 */
function createTrackingRenderer() {
  const renderTargets = new Map<string, { width: number; height: number }>();
  const materialTextures = new Map<RenderHandle, string>();
  const calls: { method: string; args: unknown[] }[] = [];
  let activeTarget: string | null = null;
  let viewport: { x: number; y: number; w: number; h: number } | null = null;
  let activeCamera: RenderHandle | null = null;
  let renderCount = 0;
  let nextHandle = 1;

  const renderer: Renderer = {
    async init() {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    createObject(params: RenderObjectParams) {
      return nextHandle++;
    },
    updateTransform() {},
    removeObject() {},
    setActiveCamera(handle: RenderHandle) {
      activeCamera = handle;
    },
    lookAt() {},
    beginFrame() {},
    endFrame() {
      renderer.render();
    },
    resize() {},

    createRenderTarget(id: string, width: number, height: number) {
      renderTargets.set(id, { width, height });
      calls.push({ method: "createRenderTarget", args: [id, width, height] });
    },
    destroyRenderTarget(id: string) {
      renderTargets.delete(id);
      calls.push({ method: "destroyRenderTarget", args: [id] });
    },
    setRenderTarget(id: string | null) {
      activeTarget = id;
      calls.push({ method: "setRenderTarget", args: [id] });
    },
    setViewport(x: number, y: number, width: number, height: number) {
      viewport = { x, y, w: width, h: height };
      calls.push({ method: "setViewport", args: [x, y, width, height] });
    },
    resetViewport() {
      viewport = null;
      calls.push({ method: "resetViewport", args: [] });
    },
    setMaterialTexture(handle: RenderHandle, renderTargetId: string) {
      materialTextures.set(handle, renderTargetId);
      calls.push({
        method: "setMaterialTexture",
        args: [handle, renderTargetId],
      });
    },
    render() {
      renderCount++;
      calls.push({ method: "render", args: [] });
    },
    destroy() {
      renderTargets.clear();
      materialTextures.clear();
    },
  };

  return {
    renderer,
    renderTargets,
    materialTextures,
    calls,
    getActiveTarget: () => activeTarget,
    getViewport: () => viewport,
    getActiveCamera: () => activeCamera,
    getRenderCount: () => renderCount,
  };
}

describe("Renderer — render target APIs", () => {
  let tracking: ReturnType<typeof createTrackingRenderer>;
  let renderer: Renderer;

  beforeEach(() => {
    tracking = createTrackingRenderer();
    renderer = tracking.renderer;
  });

  it("creates and tracks a render target", () => {
    renderer.createRenderTarget("tv-feed", 512, 512);

    expect(tracking.renderTargets.has("tv-feed")).toBe(true);
    expect(tracking.renderTargets.get("tv-feed")).toEqual({
      width: 512,
      height: 512,
    });
  });

  it("destroys a render target", () => {
    renderer.createRenderTarget("tv-feed", 512, 512);
    renderer.destroyRenderTarget("tv-feed");

    expect(tracking.renderTargets.has("tv-feed")).toBe(false);
  });

  it("sets render target for offscreen rendering", () => {
    renderer.createRenderTarget("tv-feed", 512, 512);
    renderer.setRenderTarget("tv-feed");

    expect(tracking.getActiveTarget()).toBe("tv-feed");
  });

  it("restores browser framebuffer with null", () => {
    renderer.createRenderTarget("tv-feed", 512, 512);
    renderer.setRenderTarget("tv-feed");
    renderer.setRenderTarget(null);

    expect(tracking.getActiveTarget()).toBeNull();
  });

  it("binds a render target texture to a mesh material", () => {
    renderer.createRenderTarget("tv-feed", 512, 512);
    const meshHandle = renderer.createObject({
      type: "mesh",
      geometry: "box",
      color: 0xffffff,
    });

    renderer.setMaterialTexture(meshHandle, "tv-feed");

    expect(tracking.materialTextures.get(meshHandle)).toBe("tv-feed");
  });
});

describe("Renderer — viewport APIs", () => {
  let tracking: ReturnType<typeof createTrackingRenderer>;
  let renderer: Renderer;

  beforeEach(() => {
    tracking = createTrackingRenderer();
    renderer = tracking.renderer;
  });

  it("sets viewport region (normalized coordinates)", () => {
    renderer.setViewport(0, 0, 0.5, 1);

    expect(tracking.getViewport()).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
  });

  it("resets viewport to full window", () => {
    renderer.setViewport(0, 0, 0.5, 1);
    renderer.resetViewport();

    expect(tracking.getViewport()).toBeNull();
  });

  it("supports split screen — left and right viewports", () => {
    const cam1 = renderer.createObject({
      type: "camera",
      projection: "perspective",
    });
    const cam2 = renderer.createObject({
      type: "camera",
      projection: "perspective",
    });

    // Render left half
    renderer.setViewport(0, 0, 0.5, 1);
    renderer.setActiveCamera(cam1);
    renderer.render();

    // Render right half
    renderer.setViewport(0.5, 0, 0.5, 1);
    renderer.setActiveCamera(cam2);
    renderer.render();

    renderer.resetViewport();

    expect(tracking.getRenderCount()).toBe(2);
    expect(tracking.calls.filter((c) => c.method === "setViewport")).toHaveLength(2);
  });
});

describe("Renderer — multi-pass rendering", () => {
  let tracking: ReturnType<typeof createTrackingRenderer>;
  let renderer: Renderer;

  beforeEach(() => {
    tracking = createTrackingRenderer();
    renderer = tracking.renderer;
  });

  it("renders to texture then to screen (nested view pattern)", () => {
    // Setup: inner camera renders to texture, outer camera renders to screen
    const innerCam = renderer.createObject({
      type: "camera",
      projection: "perspective",
    });
    const outerCam = renderer.createObject({
      type: "camera",
      projection: "perspective",
    });
    const tvMesh = renderer.createObject({
      type: "mesh",
      geometry: "box",
    });

    renderer.createRenderTarget("tv-feed", 512, 512);

    // Pass 1: render inner camera to texture
    renderer.setRenderTarget("tv-feed");
    renderer.setActiveCamera(innerCam);
    renderer.render();

    // Bind texture to TV mesh
    renderer.setMaterialTexture(tvMesh, "tv-feed");

    // Pass 2: render outer camera to screen
    renderer.setRenderTarget(null);
    renderer.setActiveCamera(outerCam);
    renderer.render();

    expect(tracking.getRenderCount()).toBe(2);
    expect(tracking.materialTextures.get(tvMesh)).toBe("tv-feed");

    // Verify call order: setRenderTarget("tv-feed") → render → setRenderTarget(null) → render
    const renderCalls = tracking.calls.filter(
      (c) => c.method === "setRenderTarget" || c.method === "render",
    );
    expect(renderCalls).toEqual([
      { method: "setRenderTarget", args: ["tv-feed"] },
      { method: "render", args: [] },
      { method: "setRenderTarget", args: [null] },
      { method: "render", args: [] },
    ]);
  });

  it("supports cleanup of render targets on destroy", () => {
    renderer.createRenderTarget("feed-1", 256, 256);
    renderer.createRenderTarget("feed-2", 512, 512);

    expect(tracking.renderTargets.size).toBe(2);

    renderer.destroy();

    expect(tracking.renderTargets.size).toBe(0);
  });
});
