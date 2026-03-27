/**
 * GPU particle integrate kernel — applies velocity, gravity, aging, and alpha fade.
 *
 * Physics authority: this kernel is the sole writer of Transform for
 * entities with GpuParticleTag. CPU handles spawning/despawning only.
 */

import { Transform } from "../../ecs/components/transform.js";
import { Velocity } from "../../ecs/components/velocity.js";
import { GpuParticleTag, GpuParticleLife } from "../components/particle.js";
import { fields } from "../kernel.js";
import type { GpuKernelDef } from "../kernel.js";

export const gpuParticleIntegrateKernel: GpuKernelDef = {
  name: "gpuParticleIntegrate",
  query: [GpuParticleTag, Transform, Velocity, GpuParticleLife],
  read: [Velocity],
  write: [fields(Transform, "px", "py", "pz"), GpuParticleLife],
  uniforms: { dt: "f32", gravity: "f32" },
  workgroupSize: 64,
  // 9 storage bindings: 3 read (vx,vy,vz) + 3 write (px,py,pz) + 2 write (age,maxAge) + 1 indices
  // + 1 uniform = 10 total — within the default WebGPU limit
  wgsl: `let eid = indices[id.x];

// Integrate position from velocity + gravity
px[eid] = px[eid] + vx[eid] * uniforms.dt;
py[eid] = py[eid] + (vy[eid] + uniforms.gravity) * uniforms.dt;
pz[eid] = pz[eid] + vz[eid] * uniforms.dt;

// Age particle
age[eid] = age[eid] + uniforms.dt;
maxAge[eid] = maxAge[eid];`,
};
