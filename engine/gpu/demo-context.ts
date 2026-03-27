/**
 * Demo script for feat-ESE-0012-02: GpuContext
 *
 * Run: npx tsx engine/gpu/demo-context.ts
 *
 * Demonstrates: buffer pool, dirty tracking, write claims, authority guards, destroy.
 * Uses mocked WebGPU (runs in Node without a browser).
 */

import { defineComponent, defineTag, resetComponentIdCounter } from "../ecs/component.js";
import { createWorld, addEntity, addComponent } from "../ecs/world.js";
import {
  ensureComponentBuffers,
  getBuffer,
  markCpuDirty,
  markGpuAuthoritative,
  registerWriteClaim,
  checkWriteAuthority,
  destroyGpuContext,
} from "./context.js";
import type { GpuContext } from "./context.js";
// --- Mock WebGPU for Node ---
function createMockGpuContext(): GpuContext {
  const mockDevice = {
    createBuffer: (desc: { size: number; label?: string }) => ({
      size: desc.size,
      label: desc.label ?? "",
      destroy: () => {},
    }),
    destroy: () => {},
    queue: { writeBuffer: () => {}, submit: () => {} },
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
const GpuParticleLife = defineComponent({ age: Float32Array, maxAge: Float32Array });
const GpuRigidBody = defineTag();

console.log("=== feat-ESE-0012-02: GpuContext Demo ===\n");

// 1. Create context
const gpu = createMockGpuContext();
console.log("1. Created GpuContext (mocked WebGPU device)");

// 2. Create world and register components
const world = createWorld(64);
addComponent(world, addEntity(world), Transform, { px: 1, py: 2, pz: 3 });
addComponent(world, addEntity(world), Velocity, { vx: 0.1, vy: 0, vz: 0 });
addComponent(world, addEntity(world), GpuParticleLife, { age: 0, maxAge: 5 });

ensureComponentBuffers(gpu, Transform, world.components, true);
ensureComponentBuffers(gpu, Velocity, world.components, false);
ensureComponentBuffers(gpu, GpuParticleLife, world.components, false);

console.log(`2. Registered 3 components → ${gpu.buffers.size} buffers in pool:`);
for (const [key, buf] of gpu.buffers) {
  console.log(`   ${key} → ${buf.size} bytes`);
}

// 3. Add 1000 entities to trigger buffer growth
console.log("\n3. Adding 1000 entities...");
for (let i = 0; i < 1000; i++) {
  const eid = addEntity(world);
  addComponent(world, eid, Transform, { px: i, py: 0, pz: 0 });
}
ensureComponentBuffers(gpu, Transform, world.components, true);
console.log(`   Buffer pool now has ${gpu.buffers.size} buffers`);
const pxBuf = getBuffer(gpu, Transform.id, "px");
console.log(`   Transform.px buffer size: ${pxBuf?.size} bytes (grew to fit 1000+ entities)`);

// 4. Dirty tracking
console.log("\n4. Dirty tracking:");
markCpuDirty(gpu, Transform.id);
console.log(`   cpuDirty: {${[...gpu.cpuDirty].join(", ")}} (Transform modified on CPU)`);
console.log(`   gpuDirty: {${[...gpu.gpuDirty].join(", ")}} (nothing modified on GPU yet)`);

// 5. GPU-authoritative
markGpuAuthoritative(gpu, GpuParticleLife.id);
console.log(
  `\n5. GPU-authoritative: {${[...gpu.gpuAuthoritative].join(", ")}} (GpuParticleLife skips readback)`,
);

// 6. Write claims + authority guard
console.log("\n6. Write claims & authority guard:");
registerWriteClaim(gpu, Transform, GpuRigidBody, "gpuPhysicsSystem");
console.log("   Registered: Transform owned by gpuPhysicsSystem for GpuRigidBody entities");

const physicsEntity = addEntity(world);
addComponent(world, physicsEntity, Transform, { px: 0, py: 0, pz: 0 });
addComponent(world, physicsEntity, GpuRigidBody);

try {
  checkWriteAuthority(gpu, world, Transform.id, physicsEntity);
  console.log("   ERROR: should have thrown!");
} catch (e) {
  console.log(`   ✓ Guard threw: ${(e as Error).message.slice(0, 100)}...`);
}

const normalEntity = addEntity(world);
addComponent(world, normalEntity, Transform, { px: 5, py: 5, pz: 5 });
checkWriteAuthority(gpu, world, Transform.id, normalEntity);
console.log("   ✓ Non-GpuRigidBody entity: CPU write allowed");

// 7. Destroy
console.log("\n7. Destroying GpuContext...");
const bufferCountBefore = gpu.buffers.size;
destroyGpuContext(gpu);
console.log(`   Buffers: ${bufferCountBefore} → ${gpu.buffers.size}`);
console.log(
  `   cpuDirty: ${gpu.cpuDirty.size}, gpuDirty: ${gpu.gpuDirty.size}, writeClaims: ${gpu.writeClaims.size}`,
);

console.log("\n=== Demo complete ===");
