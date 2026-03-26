/**
 * Velocity core component — linear velocity in 3D space.
 */

import { defineComponent } from "../component.js";

export const Velocity = defineComponent({
  vx: Float32Array,
  vy: Float32Array,
  vz: Float32Array,
});
