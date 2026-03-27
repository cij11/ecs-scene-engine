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

    if (cyclicIds.has(entry.id) && cam.recursionDepth > 0 && !isBrowser) {
      // Ping-pong rendering for recursive cameras.
      // Use two targets to avoid feedback loop: render to A while reading B, then swap.
      const pingTarget = cam.renderTarget;
      const pongTarget = cam.renderTarget + "__pong";

      // Ensure pong target exists
      renderer.createRenderTarget(pongTarget, 512, 512);

      // Pass 0: unbind quad, render to ping (quad shows nothing)
      unbindQuadTextures(renderer, pingTarget, quadsByTarget);
      renderer.setRenderTarget(pingTarget);
      renderer.setActiveCamera(cam.handle);
      renderer.render();
      renderer.setRenderTarget(null);

      for (let pass = 1; pass < cam.recursionDepth; pass++) {
        const readFrom = pass % 2 === 1 ? pingTarget : pongTarget;
        const writeTo = pass % 2 === 1 ? pongTarget : pingTarget;

        // Bind previous pass result to quad (look up by original target, bind to readFrom texture)
        bindQuadTextures(renderer, pingTarget, quadsByTarget, readFrom);

        // Render to the other target
        renderer.setRenderTarget(writeTo);
        renderer.setActiveCamera(cam.handle);
        renderer.render();
        renderer.setRenderTarget(null);
      }

      // Bind the final result to the quad
      const finalTarget = cam.recursionDepth % 2 === 1 ? pingTarget : pongTarget;
      bindQuadTextures(renderer, pingTarget, quadsByTarget, finalTarget);

      // Clean up pong target
      renderer.destroyRenderTarget(pongTarget);
    } else {
      // Non-cyclic camera: unbind, render, rebind
      if (!isBrowser) {
        unbindQuadTextures(renderer, cam.renderTarget, quadsByTarget);
      }
    }

    // Final pass to actual target (or only pass for non-cyclic)
    if (!isBrowser && !cyclicIds.has(entry.id)) {
      renderer.setRenderTarget(cam.renderTarget);
    } else if (isBrowser) {
      renderer.setRenderTarget(null);
    }

    if (!cyclicIds.has(entry.id) || isBrowser) {
      renderer.setActiveCamera(cam.handle);
      renderer.render();
    }

    // Rebind textures after non-cyclic rendering
    if (!isBrowser && !cyclicIds.has(entry.id)) {
      renderer.setRenderTarget(null);
      bindQuadTextures(renderer, cam.renderTarget, quadsByTarget);
    }
  }

  renderer.resetViewport();
}

function unbindQuadTextures(
  renderer: Renderer,
  renderTarget: string,
  quadsByTarget: Map<string, QuadInfo[]>,
): void {
  const targetQuads = quadsByTarget.get(renderTarget);
  if (!targetQuads) return;
  for (const quad of targetQuads) {
    renderer.clearMaterialTexture(quad.handle);
  }
}

function bindQuadTextures(
  renderer: Renderer,
  renderTarget: string,
  quadsByTarget: Map<string, QuadInfo[]>,
  overrideTextureId?: string,
): void {
  const targetQuads = quadsByTarget.get(renderTarget);
  if (!targetQuads) return;
  for (const quad of targetQuads) {
    renderer.setMaterialTexture(quad.handle, overrideTextureId ?? renderTarget);
  }
}
