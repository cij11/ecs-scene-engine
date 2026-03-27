/**
 * GPU particle components — gpu-prefixed, used by the particle PoC.
 *
 * GpuParticleLife and GpuParticleVisual are GPU-authoritative (no readback).
 * Transform is shared: GPU writes positions, renderer reads after readback.
 */

import { defineComponent, defineTag } from "../../ecs/component.js";

/** Tag marking an entity as a GPU-managed particle. */
export const GpuParticleTag = defineTag();

/** Particle aging — GPU-authoritative. */
export const GpuParticleLife = defineComponent({
  age: Float32Array,
  maxAge: Float32Array,
});

/** Particle color/alpha — GPU-authoritative. */
export const GpuParticleVisual = defineComponent({
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  a: Float32Array,
});
