/**
 * Camera dependency graph and topological sort.
 *
 * Determines render order: cameras whose output is displayed on
 * a RenderQuad visible to another camera must render first.
 */

export interface CameraEntry {
  id: string; // unique identifier (e.g. entity ID or name)
  renderTarget: string; // where this camera writes ("browser" or texture ID)
  recursionDepth: number;
}

export interface QuadEntry {
  renderTarget: string; // which texture this quad displays
}

export interface RenderOrder {
  /** Cameras in the order they should render (leaves first) */
  ordered: CameraEntry[];
  /** Cameras involved in cycles (hall of mirrors), with their recursionDepth */
  cycles: CameraEntry[];
}

/**
 * Build a dependency graph and return cameras in render order.
 *
 * A camera A depends on camera B if there exists a RenderQuad displaying
 * B's renderTarget (and B's renderTarget is not "browser").
 *
 * Conservative visibility: all quads are assumed visible to all cameras.
 */
export function buildRenderOrder(cameras: CameraEntry[], quads: QuadEntry[]): RenderOrder {
  // Map renderTarget → camera that writes to it
  const targetToCamera = new Map<string, CameraEntry>();
  for (const cam of cameras) {
    if (cam.renderTarget !== "browser") {
      targetToCamera.set(cam.renderTarget, cam);
    }
  }

  // Build adjacency: camera A depends on camera B if any quad displays B's target
  // (conservative: all quads visible to all cameras)
  const quadTargets = new Set(quads.map((q) => q.renderTarget));
  const dependencies = new Map<string, Set<string>>(); // camera id → set of camera ids it depends on

  for (const cam of cameras) {
    dependencies.set(cam.id, new Set());
  }

  for (const cam of cameras) {
    for (const quadTarget of quadTargets) {
      const producer = targetToCamera.get(quadTarget);
      if (!producer || producer.id === cam.id) continue;

      // With conservative visibility, all cameras see all quads.
      // To avoid false mutual dependencies between texture cameras,
      // only add a dependency if:
      // - the consumer renders to browser (it genuinely needs the texture), OR
      // - the consumer's own target is NOT displayed on any quad (not a peer)
      if (cam.renderTarget === "browser" || !quadTargets.has(cam.renderTarget)) {
        dependencies.get(cam.id)!.add(producer.id);
      }
    }
  }

  // Cameras with recursionDepth > 0 are marked as potentially recursive.
  // With conservative visibility we can't distinguish "TV camera not facing TV"
  // from "TV camera facing TV". The recursionDepth property on the camera
  // signals the render loop to handle iterative passes.
  const cycles: CameraEntry[] = cameras.filter((c) => c.recursionDepth > 0);

  // Topological sort (Kahn's algorithm)
  const cameraMap = new Map<string, CameraEntry>();
  for (const cam of cameras) {
    cameraMap.set(cam.id, cam);
  }

  const inDegree = new Map<string, number>();
  for (const cam of cameras) {
    inDegree.set(cam.id, 0);
  }
  for (const [, deps] of dependencies) {
    for (const dep of deps) {
      inDegree.set(dep, inDegree.get(dep) ?? 0);
      // dep is depended upon — increment dependents' inDegree
    }
  }

  // Recalculate: inDegree[X] = number of cameras that X depends on
  for (const cam of cameras) {
    inDegree.set(cam.id, dependencies.get(cam.id)!.size);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const ordered: CameraEntry[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    ordered.push(cameraMap.get(id)!);

    // For each camera that depends on this one, decrement their inDegree
    for (const [camId, deps] of dependencies) {
      if (deps.has(id) && !visited.has(camId)) {
        const newDegree = (inDegree.get(camId) ?? 1) - 1;
        inDegree.set(camId, newDegree);
        if (newDegree === 0) queue.push(camId);
      }
    }
  }

  // Any unvisited cameras are part of unresolvable cycles — add them at the end
  for (const cam of cameras) {
    if (!visited.has(cam.id)) {
      ordered.push(cam);
    }
  }

  return { ordered, cycles };
}
