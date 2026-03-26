/**
 * Renderer interface — the abstraction boundary between the view layer
 * and the rendering library (Three.js). No Three.js types are exposed here.
 */

/** Opaque handle to a renderer-managed object */
export type RenderHandle = number;

/** Object types the renderer can create */
export type RenderObjectType = "mesh" | "light" | "camera";

/** Light subtypes */
export type LightType = "point" | "directional" | "spot" | "ambient";

/** Camera projection */
export type CameraProjection = "perspective" | "orthographic";

/** Parameters for creating a mesh object */
export interface MeshParams {
  type: "mesh";
  geometryRef?: string;
  color?: number;
  roughness?: number;
  metalness?: number;
}

/** Parameters for creating a light object */
export interface LightParams {
  type: "light";
  lightType: LightType;
  color?: number;
  intensity?: number;
  range?: number;
  angle?: number;
}

/** Parameters for creating a camera object */
export interface CameraParams {
  type: "camera";
  projection: CameraProjection;
  fov?: number;
  near?: number;
  far?: number;
  zoom?: number;
}

export type RenderObjectParams = MeshParams | LightParams | CameraParams;

/** Transform data pushed to renderer objects each frame */
export interface RenderTransform {
  px: number; py: number; pz: number;
  rx: number; ry: number; rz: number; rw: number;
  sx: number; sy: number; sz: number;
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

  /** Begin a new frame */
  beginFrame(): void;

  /** End the frame (triggers the actual render) */
  endFrame(): void;

  /** Resize the renderer to match container */
  resize(width: number, height: number): void;

  /** Dispose all resources */
  destroy(): void;
}
