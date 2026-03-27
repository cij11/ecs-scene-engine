/**
 * Multi-camera render loop.
 *
 * Renders all cameras in dependency order, setting render targets
 * and binding textures for RenderQuads between passes.
 */

import type { Renderer, RenderHandle } from "./renderer.js";
import { buildRenderOrder } from "./render-graph.js";
import type { CameraEntry, QuadEntry } from "./render-graph.js";

export interface CameraInfo {
  handle: RenderHandle;
  renderTarget: string; // "browser" or texture ID
  recursionDepth: number;
}

export interface QuadInfo {
  handle: RenderHandle;
  renderTarget: string; // which texture to display
}

/**
 * Render a frame with multiple cameras in dependency order.
 *
 * 1. Build dependency graph from cameras and quads
 * 2. For each camera in order: set target, set active camera, render
 * 3. Bind textures to quads after their source camera renders
 * 4. Handle recursive cameras with iterative passes
 */
export function renderFrame(renderer: Renderer, cameras: CameraInfo[], quads: QuadInfo[]): void {
  if (cameras.length === 0) return;

  // Single camera shortcut (backward compatible)
  if (cameras.length === 1 && quads.length === 0) {
    const cam = cameras[0]!;
    renderer.setActiveCamera(cam.handle);
    renderer.render();
    return;
  }

  // Build render order
  const cameraEntries: CameraEntry[] = cameras.map((c) => ({
    id: String(c.handle),
    renderTarget: c.renderTarget,
    recursionDepth: c.recursionDepth,
  }));
  const quadEntries: QuadEntry[] = quads.map((q) => ({
    renderTarget: q.renderTarget,
  }));

  const { ordered, cycles } = buildRenderOrder(cameraEntries, quadEntries);

  // Map handle string back to CameraInfo
  const cameraByHandle = new Map<string, CameraInfo>();
  for (const cam of cameras) {
    cameraByHandle.set(String(cam.handle), cam);
  }

  // Map renderTarget → quads that display it
  const quadsByTarget = new Map<string, QuadInfo[]>();
  for (const quad of quads) {
    const list = quadsByTarget.get(quad.renderTarget) ?? [];
    list.push(quad);
    quadsByTarget.set(quad.renderTarget, list);
  }

  // Cyclic cameras need iterative passes
  const cyclicIds = new Set(cycles.map((c) => c.id));

  for (const entry of ordered) {
    const cam = cameraByHandle.get(entry.id);
    if (!cam) continue;

    const isBrowser = cam.renderTarget === "browser";

    if (cyclicIds.has(entry.id) && cam.recursionDepth > 0) {
      // Iterative passes for recursive cameras
      for (let pass = 0; pass < cam.recursionDepth; pass++) {
        if (!isBrowser) {
          renderer.setRenderTarget(cam.renderTarget);
        }
        renderer.setActiveCamera(cam.handle);
        renderer.render();

        // Bind this camera's texture to quads displaying it
        bindQuadTextures(renderer, cam.renderTarget, quadsByTarget);

        if (!isBrowser) {
          renderer.setRenderTarget(null);
        }
      }
    }

    // Final pass (or only pass for non-cyclic cameras)
    if (!isBrowser) {
      renderer.setRenderTarget(cam.renderTarget);
    } else {
      renderer.setRenderTarget(null);
    }

    renderer.setActiveCamera(cam.handle);
    renderer.render();

    // Bind textures after rendering
    if (!isBrowser) {
      bindQuadTextures(renderer, cam.renderTarget, quadsByTarget);
      renderer.setRenderTarget(null);
    }
  }

  renderer.resetViewport();
}

function bindQuadTextures(
  renderer: Renderer,
  renderTarget: string,
  quadsByTarget: Map<string, QuadInfo[]>,
): void {
  const targetQuads = quadsByTarget.get(renderTarget);
  if (!targetQuads) return;
  for (const quad of targetQuads) {
    renderer.setMaterialTexture(quad.handle, renderTarget);
  }
}
