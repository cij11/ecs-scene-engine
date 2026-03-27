/**
 * Renderer interface — the abstraction boundary between the view layer
 * and the rendering library (Three.js). No Three.js types are exposed here.
 */

/** Opaque handle to a renderer-managed object */
export type RenderHandle = number;

/** Object types the renderer can create */
export type RenderObjectType = "mesh" | "light" | "camera" | "renderQuad";

/** Light subtypes */
export type LightType = "point" | "directional" | "spot" | "ambient";

/** Camera projection */
export type CameraProjection = "perspective" | "orthographic";

/** Geometry types the renderer supports */
export type GeometryType = "box" | "sphere" | "cone" | "arrow";

/** Parameters for creating a mesh object */
export interface MeshParams {
  type: "mesh";
  geometry?: GeometryType | undefined;
  geometryRef?: string | undefined;
  color?: number | undefined;
  roughness?: number | undefined;
  metalness?: number | undefined;
  scaleX?: number | undefined;
  scaleY?: number | undefined;
  scaleZ?: number | undefined;
}

/** Parameters for creating a light object */
export interface LightParams {
  type: "light";
  lightType: LightType;
  color?: number | undefined;
  intensity?: number | undefined;
  range?: number | undefined;
  angle?: number | undefined;
}

/** Parameters for creating a camera object */
export interface CameraParams {
  type: "camera";
  projection: CameraProjection;
  fov?: number | undefined;
  near?: number | undefined;
  far?: number | undefined;
  zoom?: number | undefined;
  renderTarget?: string | undefined;
  backgroundColor?: number | undefined;
  aspectRatio?: number | undefined;
  aspectRatioMismatch?: "stretch" | "letterbox" | "truncate" | undefined;
  recursionDepth?: number | undefined;
}

/** Parameters for creating a render quad object */
export interface RenderQuadParams {
  type: "renderQuad";
  renderTarget: string;
  width: number;
  height: number;
}

export type RenderObjectParams = MeshParams | LightParams | CameraParams | RenderQuadParams;

/** Transform data pushed to renderer objects each frame */
export interface RenderTransform {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
  rw: number;
  sx: number;
  sy: number;
  sz: number;
}

/**
 * Renderer interface.
 *
 * Implementations manage their own internal scene graph.
 * Consumers interact only through opaque handles.
 */
export interface Renderer {
  /** Initialise the renderer, attaching to a DOM element. May be async (WebGPU). */
  init(target: HTMLElement): Promise<void>;

  /** Create a renderable object, returning an opaque handle */
  createObject(params: RenderObjectParams): RenderHandle;

  /** Update an object's transform */
  updateTransform(handle: RenderHandle, transform: RenderTransform): void;

  /** Remove and dispose an object */
  removeObject(handle: RenderHandle): void;

  /** Set which camera handle to render from */
  setActiveCamera(handle: RenderHandle): void;

  /** Point an object (typically a camera) at a target position */
  lookAt(handle: RenderHandle, x: number, y: number, z: number): void;

  /** Begin a new frame */
  beginFrame(): void;

  /** End the frame (triggers the actual render) */
  endFrame(): void;

  /** Resize the renderer to match container */
  resize(width: number, height: number): void;

  /** Create an offscreen render target */
  createRenderTarget(id: string, width: number, height: number): void;

  /** Destroy a render target and free its resources */
  destroyRenderTarget(id: string): void;

  /** Direct rendering to a named render target, or null for the browser framebuffer */
  setRenderTarget(id: string | null): void;

  /** Set the viewport region (normalized 0-1 coordinates) */
  setViewport(x: number, y: number, width: number, height: number): void;

  /** Restore the full-window viewport */
  resetViewport(): void;

  /** Bind a render target's texture to a mesh object's material */
  setMaterialTexture(handle: RenderHandle, renderTargetId: string): void;

  /** Render the current scene from the active camera (to the current render target/viewport) */
  render(): void;

  /** Dispose all resources */
  destroy(): void;
}
