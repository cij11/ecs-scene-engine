/**
 * Node type handlers — translate static scene nodes into
 * RenderObjectParams for the Renderer interface.
 */

import type { SceneNode } from "../engine/scene/node.js";
import type { GeometryType, RenderObjectParams } from "./renderer.js";

export type NodeHandler = (node: SceneNode) => RenderObjectParams | null;

const handlers = new Map<string, NodeHandler>();

export function registerNodeHandler(nodeType: string, handler: NodeHandler): void {
  handlers.set(nodeType, handler);
}

export function handleNode(node: SceneNode): RenderObjectParams | null {
  const handler = handlers.get(node.type);
  if (!handler) return null;
  return handler(node);
}

// Built-in handlers

registerNodeHandler(
  "mesh",
  (node): RenderObjectParams => ({
    type: "mesh",
    geometry: (node.data.geometryType as GeometryType | undefined) ?? "box",
    geometryRef: node.data.geometry as string | undefined,
    color: node.data.color as number | undefined,
    roughness: node.data.roughness as number | undefined,
    metalness: node.data.metalness as number | undefined,
    scaleX: node.data.scaleX as number | undefined,
    scaleY: node.data.scaleY as number | undefined,
    scaleZ: node.data.scaleZ as number | undefined,
  }),
);

registerNodeHandler(
  "light",
  (node): RenderObjectParams => ({
    type: "light",
    lightType: (node.data.lightType as "point" | "directional" | "spot" | "ambient") ?? "point",
    color: node.data.color as number | undefined,
    intensity: node.data.intensity as number | undefined,
    range: node.data.range as number | undefined,
    angle: node.data.angle as number | undefined,
  }),
);

registerNodeHandler(
  "camera",
  (node): RenderObjectParams => ({
    type: "camera",
    projection: (node.data.projection as "perspective" | "orthographic") ?? "perspective",
    fov: node.data.fov as number | undefined,
    near: node.data.near as number | undefined,
    far: node.data.far as number | undefined,
    zoom: node.data.zoom as number | undefined,
    renderTarget: node.data.renderTarget as string | undefined,
    backgroundColor: node.data.backgroundColor as number | undefined,
    aspectRatio: node.data.aspectRatio as number | undefined,
    aspectRatioMismatch: node.data.aspectRatioMismatch as
      | "stretch"
      | "letterbox"
      | "truncate"
      | undefined,
    recursionDepth: node.data.recursionDepth as number | undefined,
  }),
);

registerNodeHandler(
  "renderQuad",
  (node): RenderObjectParams => ({
    type: "renderQuad",
    renderTarget: (node.data.renderTarget as string) ?? "",
    width: (node.data.width as number) ?? 1,
    height: (node.data.height as number) ?? 1,
  }),
);
