/**
 * Transform core component — position, rotation, scale in 3D space.
 *
 * Right-handed, Y-up. Rotation stored as quaternion.
 * Same coordinate system as Three.js — no remapping at view boundary.
 */

import { defineComponent } from "../component.js";

export const Transform = defineComponent({
  px: Float32Array, py: Float32Array, pz: Float32Array,
  rx: Float32Array, ry: Float32Array, rz: Float32Array, rw: Float32Array,
  sx: Float32Array, sy: Float32Array, sz: Float32Array,
});
