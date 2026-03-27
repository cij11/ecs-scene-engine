/**
 * Demo script for feat-ESE-0012-03: WGSL codegen
 *
 * Run: npx tsx engine/gpu/demo-kernel.ts
 *
 * Defines three GpuKernelDefs and shows generated WGSL for each.
 */

import { defineComponent, defineTag, resetComponentIdCounter } from "../ecs/component.js";
import { generateWgsl, countBindings } from "./kernel.js";
import type { GpuKernelDef } from "./kernel.js";

resetComponentIdCounter();

// --- Components ---
const Transform = defineComponent({ px: Float32Array, py: Float32Array, pz: Float32Array });
const Velocity = defineComponent({ vx: Float32Array, vy: Float32Array, vz: Float32Array });
const GpuParticleTag = defineTag();
const GpuParticleLife = defineComponent({ age: Float32Array, maxAge: Float32Array });
const GpuParticleVisual = defineComponent({
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  a: Float32Array,
});
const GpuForce = defineComponent({ fx: Float32Array, fy: Float32Array, fz: Float32Array });
const GpuImpulse = defineComponent({ ix: Float32Array, iy: Float32Array, iz: Float32Array });
const GpuTeleport = defineComponent({
  tx: Float32Array,
  ty: Float32Array,
  tz: Float32Array,
  active: Uint8Array,
});
const GpuRigidBody = defineComponent({ mass: Float32Array, restitution: Float32Array });

console.log("=== feat-ESE-0012-03: WGSL Codegen Demo ===\n");

// --- Kernel 1: Movement ---
const movementKernel: GpuKernelDef = {
  name: "gpu_movement",
  query: [Transform, Velocity],
  read: [Velocity],
  write: [Transform],
  uniforms: { dt: "f32" },
  wgsl: `let eid = indices[id.x];
px[eid] = px[eid] + vx[eid] * uniforms.dt;
py[eid] = py[eid] + vy[eid] * uniforms.dt;
pz[eid] = pz[eid] + vz[eid] * uniforms.dt;`,
};

console.log(`── Kernel 1: Movement (${countBindings(movementKernel)} bindings) ──`);
console.log(generateWgsl(movementKernel));
console.log();

// --- Kernel 2: Particle integrate ---
const particleKernel: GpuKernelDef = {
  name: "gpu_particle_integrate",
  query: [GpuParticleTag, Transform, Velocity, GpuParticleLife],
  read: [Velocity, GpuParticleLife],
  write: [Transform, GpuParticleVisual],
  uniforms: { dt: "f32", gravity: "f32" },
  wgsl: `let eid = indices[id.x];
px[eid] = px[eid] + vx[eid] * uniforms.dt;
py[eid] = py[eid] + (vy[eid] + uniforms.gravity) * uniforms.dt;
pz[eid] = pz[eid] + vz[eid] * uniforms.dt;
age[eid] = age[eid] + uniforms.dt;
let t = age[eid] / maxAge[eid];
a[eid] = 1.0 - t;`,
};

console.log(`── Kernel 2: Particle Integrate (${countBindings(particleKernel)} bindings) ──`);
console.log(generateWgsl(particleKernel));
console.log();

// --- Kernel 3: Physics integration with intent components ---
const physicsKernel: GpuKernelDef = {
  name: "gpu_physics_integrate",
  query: [GpuRigidBody, Transform, Velocity],
  read: [GpuForce, GpuImpulse, GpuTeleport, GpuRigidBody],
  write: [Transform, Velocity],
  uniforms: { dt: "f32", substeps: "u32" },
  wgsl: `let eid = indices[id.x];
if (active[eid] == 1u) {
  px[eid] = tx[eid]; py[eid] = ty[eid]; pz[eid] = tz[eid];
} else {
  vx[eid] = vx[eid] + (fx[eid] / mass[eid]) * uniforms.dt;
  vy[eid] = vy[eid] + (fy[eid] / mass[eid]) * uniforms.dt;
  vz[eid] = vz[eid] + (fz[eid] / mass[eid]) * uniforms.dt;
  vx[eid] = vx[eid] + ix[eid] / mass[eid];
  vy[eid] = vy[eid] + iy[eid] / mass[eid];
  vz[eid] = vz[eid] + iz[eid] / mass[eid];
  px[eid] = px[eid] + vx[eid] * uniforms.dt;
  py[eid] = py[eid] + vy[eid] * uniforms.dt;
  pz[eid] = pz[eid] + vz[eid] * uniforms.dt;
}`,
};

console.log(`── Kernel 3: Physics Integration (${countBindings(physicsKernel)} bindings) ──`);
console.log(generateWgsl(physicsKernel));
console.log();

console.log("=== All 3 kernels generated successfully ===");
console.log("Note: device.createShaderModule() validation requires a WebGPU browser environment.");
