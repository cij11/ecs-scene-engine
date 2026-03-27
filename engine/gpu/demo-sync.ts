/**
 * Demo script for feat-ESE-0012-04: Buffer sync lifecycle
 *
 * Run: npx tsx engine/gpu/demo-sync.ts
 *
 * Demonstrates: upload, dispatch, write claims, intent component flow.
 * Uses mocked WebGPU (runs in Node without a browser).
 */

import { defineComponent, defineTag, resetComponentIdCounter } from "../ecs/component.js";
import { createWorld, addEntity, addComponent, getStore } from "../ecs/world.js";
import type { GpuContext } from "./context.js";
import { markCpuDirty, checkWriteAuthority } from "./context.js";
import { createGpuSystem } from "./sync.js";
import type { GpuKernelDef } from "./kernel.js";

// --- Mock WebGPU for Node ---
function createMockGpuContext(): GpuContext {
  const mockDevice = {
    createBuffer: (desc: { size: number; label?: string }) => ({
      size: desc.size,
      label: desc.label ?? "",
      destroy: () => {},
    }),
    createShaderModule: () => ({}),
    createComputePipeline: () => ({
      getBindGroupLayout: () => ({}),
    }),
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      beginComputePass: () => ({
        setPipeline: () => {},
        setBindGroup: () => {},
        dispatchWorkgroups: () => {},
        end: () => {},
      }),
      finish: () => ({}),
    }),
    destroy: () => {},
    queue: {
      writeBuffer: () => {},
      submit: () => {},
    },
  } as unknown as GPUDevice;

  return {
    device: mockDevice,
    queue: mockDevice.queue,
    buffers: new Map(),
    cpuDirty: new Set(),
    gpuDirty: new Set(),
    gpuAuthoritative: new Set(),
    writeClaims: new Map(),
    devMode: true,
  };
}

// --- Components ---
resetComponentIdCounter();
const Transform = defineComponent({ px: Float32Array, py: Float32Array, pz: Float32Array });
const Velocity = defineComponent({ vx: Float32Array, vy: Float32Array, vz: Float32Array });
const GpuRigidBody = defineTag();
const GpuForce = defineComponent({ fx: Float32Array, fy: Float32Array, fz: Float32Array });
const GpuTeleport = defineComponent({
  tx: Float32Array,
  ty: Float32Array,
  tz: Float32Array,
  active: Uint8Array,
});

console.log("=== feat-ESE-0012-04: Buffer Sync Demo ===\n");

// 1. Create world with physics entities
const gpu = createMockGpuContext();
const world = createWorld(128);

const entities: number[] = [];
for (let i = 0; i < 100; i++) {
  const eid = addEntity(world);
  addComponent(world, eid, Transform, { px: i, py: 0, pz: 0 });
  addComponent(world, eid, Velocity, { vx: 0.1, vy: 0, vz: 0 });
  addComponent(world, eid, GpuRigidBody);
  addComponent(world, eid, GpuForce, { fx: 0, fy: 0, fz: 0 });
  addComponent(world, eid, GpuTeleport, { tx: 0, ty: 0, tz: 0, active: 0 });
  entities.push(eid);
}
console.log(
  `1. Created 100 entities with Transform + Velocity + GpuRigidBody + GpuForce + GpuTeleport`,
);

// 2. CPU game logic applies intent components
const forceStore = getStore(world, GpuForce)!;
for (let i = 0; i < 10; i++) {
  forceStore.fx[entities[i]!] = 10;
  forceStore.fy[entities[i]!] = 0;
  forceStore.fz[entities[i]!] = 0;
}
markCpuDirty(gpu, GpuForce.id);
console.log("2. CPU applied GpuForce(10,0,0) to first 10 entities");

const teleportStore = getStore(world, GpuTeleport)!;
teleportStore.tx[entities[0]!] = 50;
teleportStore.ty[entities[0]!] = 50;
teleportStore.tz[entities[0]!] = 50;
teleportStore.active[entities[0]!] = 1;
markCpuDirty(gpu, GpuTeleport.id);
console.log("3. CPU set GpuTeleport(50,50,50,active=1) on entity 0");

// 3. Create GPU physics system
const physicsKernel: GpuKernelDef = {
  name: "gpuPhysics",
  query: [GpuRigidBody, Transform, Velocity],
  read: [GpuForce, GpuTeleport],
  write: [Transform, Velocity],
  uniforms: { dt: "f32" },
  wgsl: "let eid = indices[id.x];",
};

const system = createGpuSystem(gpu, physicsKernel, GpuRigidBody);
console.log(`\n4. Created GPU physics system`);
console.log(`   Write claims: Transform → gpuPhysics, Velocity → gpuPhysics`);
console.log(`   Components marked cpu-dirty: {${[...gpu.cpuDirty].join(", ")}}`);

// 4. Upload + dispatch
markCpuDirty(gpu, Transform.id);
markCpuDirty(gpu, Velocity.id);
system!(world, 0.016);
console.log(`\n5. Dispatched GPU physics system (dt=0.016)`);
console.log(`   Buffers in pool: ${gpu.buffers.size}`);
console.log(
  `   GPU-dirty components: {${[...gpu.gpuDirty].join(", ")}} (Transform, Velocity written by GPU)`,
);
console.log(`   CPU-dirty components: {${[...gpu.cpuDirty].join(", ")}} (cleared after upload)`);

// 5. Simulate readback — show what GPU would have computed
//    (Real GPU dispatch would modify the buffers; here we simulate the physics kernel's logic on CPU)
console.log(`\n6. Simulated post-readback results (CPU reference of GPU kernel logic):`);

const tStore = getStore(world, Transform)!;
const vStore = getStore(world, Velocity)!;
const dt = 0.016;

for (const eid of entities) {
  if (teleportStore.active[eid] === 1) {
    tStore.px[eid] = teleportStore.tx[eid]!;
    tStore.py[eid] = teleportStore.ty[eid]!;
    tStore.pz[eid] = teleportStore.tz[eid]!;
    teleportStore.active[eid] = 0;
  } else {
    // Apply force → velocity (assume mass=1 for simplicity)
    vStore.vx[eid]! += forceStore.fx[eid]! * dt;
    vStore.vy[eid]! += forceStore.fy[eid]! * dt;
    vStore.vz[eid]! += forceStore.fz[eid]! * dt;
    // Integrate position
    tStore.px[eid]! += vStore.vx[eid]! * dt;
    tStore.py[eid]! += vStore.vy[eid]! * dt;
    tStore.pz[eid]! += vStore.vz[eid]! * dt;
  }
  // Clear consumed intents
  forceStore.fx[eid] = 0;
  forceStore.fy[eid] = 0;
  forceStore.fz[eid] = 0;
}

console.log(
  `   Entity 0 (teleported): px=${tStore.px[entities[0]!]}, py=${tStore.py[entities[0]!]}, pz=${tStore.pz[entities[0]!]}`,
);
console.log(
  `   Entity 1 (forced):     px=${tStore.px[entities[1]!]?.toFixed(4)}, vx=${vStore.vx[entities[1]!]?.toFixed(4)} (accelerated by force)`,
);
console.log(
  `   Entity 50 (no force):  px=${tStore.px[entities[50]!]?.toFixed(4)}, vx=${vStore.vx[entities[50]!]?.toFixed(4)} (unchanged velocity)`,
);
console.log(
  `   GpuForce zeroed: fx[0]=${forceStore.fx[entities[0]!]}, fx[1]=${forceStore.fx[entities[1]!]}`,
);
console.log(`   GpuTeleport cleared: active[0]=${teleportStore.active[entities[0]!]}`);

// 6. Authority guard
console.log(`\n7. Authority guard test:`);
try {
  checkWriteAuthority(gpu, world, Transform.id, entities[0]!);
  console.log("   ERROR: should have thrown!");
} catch {
  console.log(`   ✓ CPU write to Transform on GpuRigidBody entity blocked`);
}

// Non-physics entity is fine
const kinematicEntity = addEntity(world);
addComponent(world, kinematicEntity, Transform, { px: 0, py: 0, pz: 0 });
checkWriteAuthority(gpu, world, Transform.id, kinematicEntity);
console.log("   ✓ CPU write to Transform on non-GpuRigidBody entity allowed");

console.log("\n=== Demo complete ===");
