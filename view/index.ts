// Renderer interface
export type {
  Renderer,
  RenderHandle,
  RenderObjectType,
  LightType,
  CameraProjection,
  MeshParams,
  LightParams,
  CameraParams,
  RenderObjectParams,
  RenderTransform,
} from "./renderer.js";

// Three.js renderer
export { ThreeJSRenderer } from "./threejs/index.js";

// View sync
export {
  Transform,
  createViewSync,
  syncWorld,
  syncWorldTree,
  type ViewSync,
} from "./sync.js";

// Node handlers
export {
  handleNode,
  registerNodeHandler,
  type NodeHandler,
} from "./node-handlers.js";
