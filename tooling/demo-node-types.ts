import { createNode } from "../engine/scene/node.js";
import { handleNode } from "../view/node-handlers.js";

console.log("=== Camera & RenderQuad Node Types Demo ===");

const cam = createNode("camera", {
  projection: "perspective",
  fov: 75,
  renderTarget: "tv-feed",
  aspectRatio: 16 / 9,
  aspectRatioMismatch: "letterbox",
  recursionDepth: 2,
});
const cp = handleNode(cam)!;
console.log("1. Camera with renderTarget:");
console.log("   renderTarget:", (cp as Record<string, unknown>).renderTarget);
console.log("   aspectRatio:", (cp as Record<string, unknown>).aspectRatio);
console.log(
  "   aspectRatioMismatch:",
  (cp as Record<string, unknown>).aspectRatioMismatch,
);
console.log(
  "   recursionDepth:",
  (cp as Record<string, unknown>).recursionDepth,
);

const quad = createNode("renderQuad", {
  renderTarget: "tv-feed",
  width: 2,
  height: 1.5,
});
const qp = handleNode(quad)!;
console.log("2. RenderQuad:");
console.log("   type:", qp.type);
console.log("   renderTarget:", (qp as Record<string, unknown>).renderTarget);
console.log(
  "   width:",
  (qp as Record<string, unknown>).width,
  "height:",
  (qp as Record<string, unknown>).height,
);

const def = createNode("camera", { projection: "orthographic" });
const dp = handleNode(def)!;
console.log(
  "3. Default camera (no renderTarget):",
  (dp as Record<string, unknown>).renderTarget,
);
