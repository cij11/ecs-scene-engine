/**
 * GpuPosition — slim position-only component for GPU compute.
 *
 * Transform has 10 fields (position + rotation + scale) which exceeds
 * the WebGPU storage buffer limit when combined with other components.
 * GpuPosition provides just px/py/pz for GPU kernels.
 *
 * The view sync layer copies GpuPosition → Transform.position after readback.
 */

import { defineComponent } from "../../ecs/component.js";

export const GpuPosition = defineComponent({
  px: Float32Array,
  py: Float32Array,
  pz: Float32Array,
});
