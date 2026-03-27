/**
 * GpuContext — WebGPU device lifecycle, buffer pool, dirty tracking,
 * and write authority registry.
 *
 * See architecture.md sections 4 and 7.
 */

import type { ComponentDef, SchemaDefinition, ComponentRegistry } from "../ecs/component.js";
import type { AnyComponentDef } from "../ecs/component.js";
import type { World } from "../ecs/world.js";
import { hasComponent } from "../ecs/world.js";
import { bufferKey, GPU_BUFFER_USAGE } from "./types.js";

// ---------------------------------------------------------------------------
// Write claims — authority guard registry
// ---------------------------------------------------------------------------

export interface WriteClaim {
  /** The component this GPU system writes to (e.g. Transform) */
  component: AnyComponentDef;
  /** Entities must have this tag for the claim to apply (e.g. GpuRigidBody) */
  requiredTag: AnyComponentDef;
  /** Name of the owning GPU system (for error messages) */
  owner: string;
}

// ---------------------------------------------------------------------------
// GpuContext
// ---------------------------------------------------------------------------

export interface GpuContext {
  device: GPUDevice;
  queue: GPUQueue;

  /** Buffer pool: bufferKey(componentId, fieldName) → GPUBuffer */
  buffers: Map<string, GPUBuffer>;

  /** Component IDs modified on CPU since last upload */
  cpuDirty: Set<number>;

  /** Component IDs modified on GPU since last readback */
  gpuDirty: Set<number>;

  /** Component IDs that live on GPU — skip readback */
  gpuAuthoritative: Set<number>;

  /** Write claims: component ID → list of claims */
  writeClaims: Map<number, WriteClaim[]>;

  /** Whether authority guards are active (dev mode) */
  devMode: boolean;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export interface GpuContextOptions {
  devMode?: boolean;
}

/**
 * Create a GpuContext. Returns null if WebGPU is unavailable.
 */
export async function createGpuContext(opts?: GpuContextOptions): Promise<GpuContext | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    return null;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;

  const device = await adapter.requestDevice();

  return {
    device,
    queue: device.queue,
    buffers: new Map(),
    cpuDirty: new Set(),
    gpuDirty: new Set(),
    gpuAuthoritative: new Set(),
    writeClaims: new Map(),
    devMode: opts?.devMode ?? true,
  };
}

// ---------------------------------------------------------------------------
// Buffer pool
// ---------------------------------------------------------------------------

/**
 * Ensure a GPUBuffer exists for the given component field.
 * Creates or recreates if the capacity has changed.
 */
export function ensureBuffer(
  gpu: GpuContext,
  componentId: number,
  fieldName: string,
  byteLength: number,
  usage: GPUBufferUsageFlags,
): GPUBuffer {
  const key = bufferKey(componentId, fieldName);
  const existing = gpu.buffers.get(key);

  if (existing && existing.size >= byteLength) {
    return existing;
  }

  // Destroy old buffer if it exists
  if (existing) {
    existing.destroy();
  }

  const buffer = gpu.device.createBuffer({
    size: byteLength,
    usage,
    label: key,
  });

  gpu.buffers.set(key, buffer);
  return buffer;
}

/**
 * Ensure GPU buffers exist for all fields of a component,
 * sized to match the current component storage capacity.
 */
export function ensureComponentBuffers<S extends SchemaDefinition>(
  gpu: GpuContext,
  def: ComponentDef<S>,
  registry: ComponentRegistry,
  writable: boolean,
): void {
  const storage = registry.storages.get(def.id);
  if (!storage) return;

  const baseUsage = GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST;
  const usage = writable ? baseUsage | GPU_BUFFER_USAGE.COPY_SRC : baseUsage;

  for (const fieldName in def.schema) {
    const typedArray = storage.stores[fieldName]!;
    ensureBuffer(gpu, def.id, fieldName, typedArray.byteLength, usage);
  }
}

/**
 * Get a GPUBuffer from the pool. Returns undefined if not yet created.
 */
export function getBuffer(
  gpu: GpuContext,
  componentId: number,
  fieldName: string,
): GPUBuffer | undefined {
  return gpu.buffers.get(bufferKey(componentId, fieldName));
}

// ---------------------------------------------------------------------------
// Dirty tracking
// ---------------------------------------------------------------------------

/** Mark a component as modified on CPU (needs upload before next dispatch). */
export function markCpuDirty(gpu: GpuContext, componentId: number): void {
  gpu.cpuDirty.add(componentId);
}

/** Mark a component as modified on GPU (needs readback before CPU reads). */
export function markGpuDirty(gpu: GpuContext, componentId: number): void {
  gpu.gpuDirty.add(componentId);
}

/** Mark a component as GPU-authoritative (skip readback). */
export function markGpuAuthoritative(gpu: GpuContext, componentId: number): void {
  gpu.gpuAuthoritative.add(componentId);
}

// ---------------------------------------------------------------------------
// Write claims — authority guards
// ---------------------------------------------------------------------------

/**
 * Register a write claim: declares that a GPU system owns writes to a
 * component for entities that have the given authority tag.
 */
export function registerWriteClaim(
  gpu: GpuContext,
  component: AnyComponentDef,
  requiredTag: AnyComponentDef,
  owner: string,
): void {
  const claim: WriteClaim = { component, requiredTag, owner };
  const existing = gpu.writeClaims.get(component.id);
  if (existing) {
    existing.push(claim);
  } else {
    gpu.writeClaims.set(component.id, [claim]);
  }
}

/**
 * Check whether a CPU write to a component on an entity violates
 * a GPU write claim. Throws in dev mode, no-op in production.
 *
 * Call this from setComponentData or a guarded store wrapper.
 */
export function checkWriteAuthority(
  gpu: GpuContext,
  world: World,
  componentId: number,
  entityId: number,
): void {
  if (!gpu.devMode) return;

  const claims = gpu.writeClaims.get(componentId);
  if (!claims) return;

  for (const claim of claims) {
    if (hasComponent(world, entityId, claim.requiredTag)) {
      throw new Error(
        `Authority violation: CPU tried to write component ${componentId} ` +
          `on entity ${entityId}, but "${claim.owner}" owns writes for ` +
          `entities with tag ${claim.requiredTag.id}. ` +
          `Use intent components (GpuForce, GpuImpulse, GpuTeleport) instead.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Destroy all GPU resources and clear state. */
export function destroyGpuContext(gpu: GpuContext): void {
  for (const buffer of gpu.buffers.values()) {
    buffer.destroy();
  }
  gpu.buffers.clear();
  gpu.cpuDirty.clear();
  gpu.gpuDirty.clear();
  gpu.gpuAuthoritative.clear();
  gpu.writeClaims.clear();
  gpu.device.destroy();
}
