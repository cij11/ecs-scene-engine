/**
 * Aspect ratio mismatch handling.
 *
 * Computes viewport region when a camera's aspect ratio differs
 * from its destination surface (RenderQuad or screen region).
 */

export type AspectRatioMode = "stretch" | "letterbox" | "truncate";

export interface Viewport {
  x: number; // normalized 0-1
  y: number;
  width: number;
  height: number;
}

/**
 * Compute the viewport region for a camera rendering to a destination.
 *
 * @param cameraAspect - camera's output aspect ratio (width/height)
 * @param destAspect - destination surface aspect ratio (width/height)
 * @param mode - how to handle mismatch
 * @returns normalized viewport within the destination (0-1 coordinates)
 */
export function computeViewport(
  cameraAspect: number,
  destAspect: number,
  mode: AspectRatioMode = "letterbox",
): Viewport {
  if (mode === "stretch" || Math.abs(cameraAspect - destAspect) < 0.001) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  if (mode === "letterbox") {
    if (cameraAspect > destAspect) {
      // Camera is wider than destination — width-constrained, bars top/bottom
      const scale = destAspect / cameraAspect;
      const barHeight = (1 - scale) / 2;
      return { x: 0, y: barHeight, width: 1, height: scale };
    } else {
      // Camera is taller than destination — height-constrained, bars left/right
      const scale = cameraAspect / destAspect;
      const barWidth = (1 - scale) / 2;
      return { x: barWidth, y: 0, width: scale, height: 1 };
    }
  }

  // truncate
  if (cameraAspect > destAspect) {
    // Camera is wider — fit height, crop sides
    const scale = cameraAspect / destAspect;
    const cropX = (1 - 1 / scale) / 2;
    return { x: -cropX, y: 0, width: 1 + 2 * cropX, height: 1 };
  } else {
    // Camera is taller — fit width, crop top/bottom
    const scale = destAspect / cameraAspect;
    const cropY = (1 - 1 / scale) / 2;
    return { x: 0, y: -cropY, width: 1, height: 1 + 2 * cropY };
  }
}
