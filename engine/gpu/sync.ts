/**
 * Buffer sync — upload, dispatch, readback lifecycle.
 *
 * Bridges CPU ECS TypedArrays and GPU storage buffers.
 * See architecture.md sections 3, 7, and 8.
 */

import type { AnyComponentDef, ComponentDef } from "../ecs/component.js";
import type { World } from "../ecs/world.js";
import type { SystemFn } from "../ecs/system.js";
import { query, getStore } from "../ecs/world.js";
import { queryEntities } from "../ecs/query.js";
import type { GpuContext } from "./context.js";
import {
  ensureBuffer,
  ensureComponentBuffers,
  markCpuDirty,
  markGpuDirty,
  registerWriteClaim,
} from "./context.js";
import type { GpuKernelDef } from "./kernel.js";
import { generateWgsl } from "./kernel.js";
import { GPU_BUFFER_USAGE } from "./types.js";
import { bufferKey } from "./types.js";

// ---------------------------------------------------------------------------
// Upload: CPU → GPU
// ---------------------------------------------------------------------------

/**
 * Upload dirty CPU TypedArrays to their corresponding GPUBuffers.
 * Only uploads components that are in the kernel's read or write set
 * AND are marked dirty.
 */
export function uploadBuffers(gpu: GpuContext, world: World, kernel: GpuKernelDef): void {
  const allComponents = [...kernel.read, ...kernel.write];
  const seen = new Set<number>();

  for (const comp of allComponents) {
    if (seen.has(comp.id)) continue;
    seen.add(comp.id);

    // Ensure buffers exist at correct size
    const isWritable = kernel.write.some((w) => w.id === comp.id);
    ensureComponentBuffers(gpu, comp, world.components, isWritable);

    // Only upload if dirty
    if (!gpu.cpuDirty.has(comp.id)) continue;

    const store = getStore(world, comp);
    if (!store) continue;

    for (const field in comp.schema) {
      const cpuArray = store[field]!;
      const gpuBuf = gpu.buffers.get(bufferKey(comp.id, field));
      if (gpuBuf) {
        gpu.queue.writeBuffer(gpuBuf, 0, cpuArray.buffer, cpuArray.byteOffset, cpuArray.byteLength);
      }
    }
  }

  // Clear dirty flags for uploaded components
  for (const comp of allComponents) {
    gpu.cpuDirty.delete(comp.id);
  }
}

// ---------------------------------------------------------------------------
// Dispatch: execute compute pass
// ---------------------------------------------------------------------------

export interface CompiledKernel {
  kernel: GpuKernelDef;
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

/**
 * Compile a kernel definition into a GPU pipeline (cached).
 */
export function compileKernel(gpu: GpuContext, kernel: GpuKernelDef): CompiledKernel {
  const wgsl = generateWgsl(kernel);
  const module = gpu.device.createShaderModule({ code: wgsl });
  const pipeline = gpu.device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });
  const bindGroupLayout = pipeline.getBindGroupLayout(0);

  return { kernel, pipeline, bindGroupLayout };
}

/**
 * Create a bind group for a kernel dispatch.
 * Binds uniforms, index buffer, and component field buffers.
 */
function createBindGroup(
  gpu: GpuContext,
  compiled: CompiledKernel,
  indexBuffer: GPUBuffer,
  uniformBuffer: GPUBuffer | null,
): GPUBindGroup {
  const entries: GPUBindGroupEntry[] = [];
  let binding = 0;

  // Uniforms
  if (compiled.kernel.uniforms && Object.keys(compiled.kernel.uniforms).length > 0) {
    entries.push({
      binding,
      resource: { buffer: uniformBuffer! },
    });
    binding++;
  }

  // Index buffer
  entries.push({
    binding,
    resource: { buffer: indexBuffer },
  });
  binding++;

  // Component field buffers (deduplicated, same order as generateWgsl)
  const emitted = new Set<number>();
  for (const comp of [...compiled.kernel.read, ...compiled.kernel.write]) {
    if (emitted.has(comp.id)) continue;
    emitted.add(comp.id);

    for (const field in comp.schema) {
      const buf = gpu.buffers.get(bufferKey(comp.id, field));
      if (!buf) {
        throw new Error(`Missing GPU buffer for component ${comp.id} field "${field}"`);
      }
      entries.push({
        binding,
        resource: { buffer: buf },
      });
      binding++;
    }
  }

  return gpu.device.createBindGroup({
    layout: compiled.bindGroupLayout,
    entries,
  });
}

/**
 * Dispatch a compiled kernel for the entities matching its query.
 */
export function dispatchKernel(
  gpu: GpuContext,
  world: World,
  compiled: CompiledKernel,
  uniformData?: ArrayBuffer,
): void {
  const q = query(world, compiled.kernel.query);
  const entities = queryEntities(q);
  if (entities.length === 0) return;

  const wgSize = compiled.kernel.workgroupSize ?? 64;

  // Upload index buffer
  const indexData = new Uint32Array(entities);
  const indexBuffer = ensureBuffer(
    gpu,
    -1,
    `__indices_${compiled.kernel.name}`,
    indexData.byteLength,
    GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
  );
  gpu.queue.writeBuffer(indexBuffer, 0, indexData);

  // Upload uniforms
  let uniformBuffer: GPUBuffer | null = null;
  if (uniformData && compiled.kernel.uniforms && Object.keys(compiled.kernel.uniforms).length > 0) {
    uniformBuffer = ensureBuffer(
      gpu,
      -2,
      `__uniforms_${compiled.kernel.name}`,
      uniformData.byteLength,
      GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    );
    gpu.queue.writeBuffer(uniformBuffer, 0, new Uint8Array(uniformData));
  }

  // Create bind group
  const bindGroup = createBindGroup(gpu, compiled, indexBuffer, uniformBuffer);

  // Dispatch
  const encoder = gpu.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(compiled.pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(entities.length / wgSize));
  pass.end();
  gpu.queue.submit([encoder.finish()]);

  // Mark written components as GPU-dirty
  for (const comp of compiled.kernel.write) {
    markGpuDirty(gpu, comp.id);
  }
}

// ---------------------------------------------------------------------------
// Readback: GPU → CPU
// ---------------------------------------------------------------------------

/**
 * Read back GPU-written component data into CPU TypedArrays.
 * Skips GPU-authoritative components unless forceReadback is true.
 *
 * Note: This is async because mapAsync is required for GPU readback.
 */
export async function readbackBuffers(
  gpu: GpuContext,
  world: World,
  components: ComponentDef[],
  forceReadback: boolean = false,
): Promise<void> {
  for (const comp of components) {
    if (!gpu.gpuDirty.has(comp.id)) continue;
    if (gpu.gpuAuthoritative.has(comp.id) && !forceReadback) continue;

    const store = getStore(world, comp);
    if (!store) continue;

    for (const field in comp.schema) {
      const srcBuffer = gpu.buffers.get(bufferKey(comp.id, field));
      if (!srcBuffer) continue;

      const cpuArray = store[field] as Float32Array;

      // Create staging buffer for readback
      const stagingBuffer = gpu.device.createBuffer({
        size: cpuArray.byteLength,
        usage: GPU_BUFFER_USAGE.MAP_READ | GPU_BUFFER_USAGE.COPY_DST,
      });

      // Copy from storage buffer to staging buffer
      const encoder = gpu.device.createCommandEncoder();
      encoder.copyBufferToBuffer(srcBuffer, 0, stagingBuffer, 0, cpuArray.byteLength);
      gpu.queue.submit([encoder.finish()]);

      // Map and read
      await stagingBuffer.mapAsync(GPUMapMode.READ);
      const mapped = new Float32Array(stagingBuffer.getMappedRange());
      cpuArray.set(mapped);
      stagingBuffer.unmap();
      stagingBuffer.destroy();
    }

    gpu.gpuDirty.delete(comp.id);
  }
}

// ---------------------------------------------------------------------------
// createGpuSystem: wraps everything into a SystemFn
// ---------------------------------------------------------------------------

export interface GpuSystemOptions {
  /** Uniform data builder — called each frame with dt */
  buildUniforms?: (dt: number) => ArrayBuffer;
  /** Components to readback after dispatch (defaults to kernel.write) */
  readbackComponents?: ComponentDef[];
  /** Skip readback entirely (for GPU-authoritative systems) */
  skipReadback?: boolean;
}

/**
 * Create a SystemFn that uploads, dispatches, and optionally reads back
 * a GPU compute kernel each frame.
 *
 * Also registers write claims for authority guards.
 *
 * Returns null if gpu is null (WebGPU unavailable — graceful fallback).
 */
export function createGpuSystem(
  gpu: GpuContext | null,
  kernel: GpuKernelDef,
  authorityTag: AnyComponentDef | null,
  opts?: GpuSystemOptions,
): SystemFn | null {
  if (!gpu) return null;

  // Register write claims for authority guards
  if (authorityTag) {
    for (const comp of kernel.write) {
      registerWriteClaim(gpu, comp, authorityTag, kernel.name);
    }
  }

  // Mark all CPU-written components as initially dirty
  for (const comp of [...kernel.read, ...kernel.write]) {
    markCpuDirty(gpu, comp.id);
  }

  // Compile pipeline
  const compiled = compileKernel(gpu, kernel);

  // The SystemFn
  return (world: World, dt: number) => {
    // 1. Upload dirty CPU buffers
    uploadBuffers(gpu, world, kernel);

    // 2. Build uniforms and dispatch
    const uniformData = opts?.buildUniforms?.(dt);
    dispatchKernel(gpu, world, compiled, uniformData);

    // 3. Readback is handled separately (async)
    // The caller should schedule readbackBuffers at a sync point
  };
}
