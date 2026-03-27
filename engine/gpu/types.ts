/**
 * GPU compute system types — WGSL type mapping, buffer keys, and shared interfaces.
 */

import type { TypedArrayConstructor } from "../ecs/component.js";

export type WgslType = "f32" | "u32" | "i32" | "vec2f" | "vec3f" | "vec4f";

/** Map a TypedArray constructor to its WGSL scalar type. */
export function typedArrayToWgsl(ctor: TypedArrayConstructor): WgslType {
  switch (ctor) {
    case Float32Array:
    case Float64Array: // downcast — WGSL has no f64
      return "f32";
    case Int32Array:
    case Int16Array:
    case Int8Array:
      return "i32";
    case Uint32Array:
    case Uint16Array:
    case Uint8Array:
      return "u32";
    default:
      return "f32";
  }
}

/** Stable key for the buffer pool: "componentId:fieldName" */
export function bufferKey(componentId: number, fieldName: string): string {
  return `${componentId}:${fieldName}`;
}

/**
 * GPUBufferUsage flag constants.
 * Mirrors the WebGPU spec so we don't depend on the global being available
 * (e.g. in Node/test environments).
 */
export const GPU_BUFFER_USAGE = {
  STORAGE: 0x0080,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  MAP_READ: 0x0001,
  UNIFORM: 0x0040,
} as const;
