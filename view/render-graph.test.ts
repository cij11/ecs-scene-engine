import { describe, it, expect } from "vitest";
import { buildRenderOrder } from "./render-graph.js";
import type { CameraEntry, QuadEntry } from "./render-graph.js";

describe("buildRenderOrder", () => {
  it("two independent cameras — no dependencies", () => {
    const cameras: CameraEntry[] = [
      { id: "cam-1", renderTarget: "browser", recursionDepth: 0 },
      { id: "cam-2", renderTarget: "browser", recursionDepth: 0 },
    ];
    const quads: QuadEntry[] = [];

    const result = buildRenderOrder(cameras, quads);

    expect(result.ordered).toHaveLength(2);
    expect(result.cycles).toHaveLength(0);
  });

  it("split screen — cameras rendering to browser have no dependency", () => {
    const cameras: CameraEntry[] = [
      { id: "player1", renderTarget: "browser", recursionDepth: 0 },
      { id: "player2", renderTarget: "browser", recursionDepth: 0 },
    ];
    const quads: QuadEntry[] = [{ renderTarget: "p1-view" }, { renderTarget: "p2-view" }];

    const result = buildRenderOrder(cameras, quads);

    expect(result.ordered).toHaveLength(2);
    expect(result.cycles).toHaveLength(0);
  });

  it("TV in scene — inner camera renders before outer", () => {
    const cameras: CameraEntry[] = [
      { id: "room-cam", renderTarget: "browser", recursionDepth: 0 },
      { id: "tv-cam", renderTarget: "tv-feed", recursionDepth: 0 },
    ];
    const quads: QuadEntry[] = [{ renderTarget: "tv-feed" }];

    const result = buildRenderOrder(cameras, quads);

    expect(result.ordered).toHaveLength(2);
    expect(result.ordered[0]!.id).toBe("tv-cam");
    expect(result.ordered[1]!.id).toBe("room-cam");
    expect(result.cycles).toHaveLength(0);
  });

  it("two texture cameras — both render before browser camera", () => {
    // With conservative visibility, cam-B and cam-C see each other's quads
    // (mutual dependency). But cam-A (browser) depends on both.
    const cameras: CameraEntry[] = [
      { id: "cam-A", renderTarget: "browser", recursionDepth: 0 },
      { id: "cam-B", renderTarget: "feed-B", recursionDepth: 0 },
      { id: "cam-C", renderTarget: "feed-C", recursionDepth: 0 },
    ];
    const quads: QuadEntry[] = [{ renderTarget: "feed-B" }, { renderTarget: "feed-C" }];

    const result = buildRenderOrder(cameras, quads);

    const ids = result.ordered.map((c) => c.id);
    // Browser camera must be last (depends on both texture cameras)
    expect(ids.indexOf("cam-A")).toBe(ids.length - 1);
    // Both texture cameras are in the output
    expect(ids).toContain("cam-B");
    expect(ids).toContain("cam-C");
  });

  it("hall of mirrors — recursionDepth marks cycle", () => {
    const cameras: CameraEntry[] = [
      { id: "mirror-cam", renderTarget: "mirror-view", recursionDepth: 3 },
    ];
    const quads: QuadEntry[] = [{ renderTarget: "mirror-view" }];

    const result = buildRenderOrder(cameras, quads);

    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]!.id).toBe("mirror-cam");
    expect(result.cycles[0]!.recursionDepth).toBe(3);
    expect(result.ordered).toHaveLength(1);
  });

  it("mixed — independent and dependent cameras", () => {
    const cameras: CameraEntry[] = [
      { id: "main", renderTarget: "browser", recursionDepth: 0 },
      { id: "security", renderTarget: "sec-feed", recursionDepth: 0 },
      { id: "hud", renderTarget: "browser", recursionDepth: 0 },
    ];
    const quads: QuadEntry[] = [{ renderTarget: "sec-feed" }];

    const result = buildRenderOrder(cameras, quads);

    const ids = result.ordered.map((c) => c.id);
    // security must render before main (main can see its quad)
    expect(ids.indexOf("security")).toBeLessThan(ids.indexOf("main"));
    // hud is independent — can be anywhere
    expect(result.ordered).toHaveLength(3);
    expect(result.cycles).toHaveLength(0);
  });

  it("recursionDepth > 0 marks camera as cyclic", () => {
    const cameras: CameraEntry[] = [
      { id: "room-cam", renderTarget: "browser", recursionDepth: 0 },
      { id: "tv-cam", renderTarget: "tv-feed", recursionDepth: 2 },
    ];
    const quads: QuadEntry[] = [{ renderTarget: "tv-feed" }];

    const result = buildRenderOrder(cameras, quads);

    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]!.id).toBe("tv-cam");
    expect(result.cycles[0]!.recursionDepth).toBe(2);
    // tv-cam still appears in ordered (renders before room-cam)
    const ids = result.ordered.map((c) => c.id);
    expect(ids.indexOf("tv-cam")).toBeLessThan(ids.indexOf("room-cam"));
  });

  it("recursionDepth 0 is not cyclic even if target on a quad", () => {
    const cameras: CameraEntry[] = [
      { id: "room-cam", renderTarget: "browser", recursionDepth: 0 },
      { id: "tv-cam", renderTarget: "tv-feed", recursionDepth: 0 },
    ];
    const quads: QuadEntry[] = [{ renderTarget: "tv-feed" }];

    const result = buildRenderOrder(cameras, quads);

    expect(result.cycles).toHaveLength(0);
  });
});
