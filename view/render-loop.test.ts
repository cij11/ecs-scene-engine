import { describe, it, expect, beforeEach } from "vitest";
import type { Renderer, RenderHandle, RenderObjectParams } from "./renderer.js";
import { renderFrame } from "./render-loop.js";
import type { CameraInfo, QuadInfo } from "./render-loop.js";

function createTrackingRenderer() {
  const calls: { method: string; args: unknown[] }[] = [];
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
      calls.push({ method: "setActiveCamera", args: [handle] });
    },
    lookAt() {},
    beginFrame() {},
    endFrame() {},
    resize() {},
    createRenderTarget() {},
    destroyRenderTarget() {},
    setRenderTarget(id: string | null) {
      calls.push({ method: "setRenderTarget", args: [id] });
    },
    setViewport() {},
    resetViewport() {
      calls.push({ method: "resetViewport", args: [] });
    },
    clearMaterialTexture() {},
    setMaterialTexture(handle: RenderHandle, targetId: string) {
      calls.push({ method: "setMaterialTexture", args: [handle, targetId] });
    },
    render() {
      calls.push({ method: "render", args: [] });
    },
    destroy() {},
  };

  return { renderer, calls };
}

describe("renderFrame", () => {
  let tracking: ReturnType<typeof createTrackingRenderer>;

  beforeEach(() => {
    tracking = createTrackingRenderer();
  });

  it("single camera — one render pass", () => {
    const cameras: CameraInfo[] = [{ handle: 1, renderTarget: "browser", recursionDepth: 0 }];

    renderFrame(tracking.renderer, cameras, []);

    const renders = tracking.calls.filter((c) => c.method === "render");
    expect(renders).toHaveLength(1);
  });

  it("two cameras — texture camera renders before browser camera", () => {
    const cameras: CameraInfo[] = [
      { handle: 1, renderTarget: "browser", recursionDepth: 0 },
      { handle: 2, renderTarget: "tv-feed", recursionDepth: 0 },
    ];
    const quads: QuadInfo[] = [{ handle: 10, renderTarget: "tv-feed" }];

    renderFrame(tracking.renderer, cameras, quads);

    const renders = tracking.calls.filter((c) => c.method === "render");
    expect(renders).toHaveLength(2);

    // Texture camera (handle 2) should be set active before first render
    const setActiveCalls = tracking.calls.filter((c) => c.method === "setActiveCamera");
    expect(setActiveCalls[0]!.args[0]).toBe(2); // tv-cam first
    expect(setActiveCalls[1]!.args[0]).toBe(1); // browser cam second
  });

  it("texture bound to quad after source camera renders", () => {
    const cameras: CameraInfo[] = [
      { handle: 1, renderTarget: "browser", recursionDepth: 0 },
      { handle: 2, renderTarget: "tv-feed", recursionDepth: 0 },
    ];
    const quads: QuadInfo[] = [{ handle: 10, renderTarget: "tv-feed" }];

    renderFrame(tracking.renderer, cameras, quads);

    // Find the texture bind call
    const bindIdx = tracking.calls.findIndex(
      (c) => c.method === "setMaterialTexture" && c.args[0] === 10 && c.args[1] === "tv-feed",
    );
    expect(bindIdx).toBeGreaterThan(-1);

    // First render (tv-cam) should come before the bind
    const firstRenderIdx = tracking.calls.findIndex((c) => c.method === "render");
    expect(firstRenderIdx).toBeLessThan(bindIdx);
  });

  it("render target set before rendering to texture", () => {
    const cameras: CameraInfo[] = [
      { handle: 1, renderTarget: "browser", recursionDepth: 0 },
      { handle: 2, renderTarget: "tv-feed", recursionDepth: 0 },
    ];
    const quads: QuadInfo[] = [{ handle: 10, renderTarget: "tv-feed" }];

    renderFrame(tracking.renderer, cameras, quads);

    // setRenderTarget("tv-feed") should come before first render
    const setTargetIdx = tracking.calls.findIndex(
      (c) => c.method === "setRenderTarget" && c.args[0] === "tv-feed",
    );
    const firstRenderIdx = tracking.calls.findIndex((c) => c.method === "render");
    expect(setTargetIdx).toBeLessThan(firstRenderIdx);

    // setRenderTarget(null) should come before browser camera renders
    const setNullIdx = tracking.calls.findIndex(
      (c) => c.method === "setRenderTarget" && c.args[0] === null,
    );
    const secondRenderIdx = tracking.calls.findIndex(
      (c, i) => c.method === "render" && i > firstRenderIdx,
    );
    expect(setNullIdx).toBeLessThan(secondRenderIdx);
  });

  it("recursive camera renders multiple passes via ping-pong", () => {
    const cameras: CameraInfo[] = [
      { handle: 1, renderTarget: "mirror-view", recursionDepth: 3 },
      { handle: 2, renderTarget: "browser", recursionDepth: 0 },
    ];
    const quads: QuadInfo[] = [{ handle: 10, renderTarget: "mirror-view" }];

    renderFrame(tracking.renderer, cameras, quads);

    // 3 ping-pong passes for the cyclic camera + 1 browser render = 4
    const renders = tracking.calls.filter((c) => c.method === "render");
    expect(renders).toHaveLength(4);
  });

  it("resets viewport at the end", () => {
    const cameras: CameraInfo[] = [
      { handle: 1, renderTarget: "browser", recursionDepth: 0 },
      { handle: 2, renderTarget: "tv-feed", recursionDepth: 0 },
    ];
    const quads: QuadInfo[] = [{ handle: 10, renderTarget: "tv-feed" }];

    renderFrame(tracking.renderer, cameras, quads);

    const lastCall = tracking.calls[tracking.calls.length - 1];
    expect(lastCall!.method).toBe("resetViewport");
  });
});
