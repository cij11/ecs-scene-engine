import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetComponentIdCounter, defineComponent, defineTag } from "../ecs/component.js";
import { createWorld, addEntity, addComponent } from "../ecs/world.js";
import type { GpuContext } from "./context.js";
import { markCpuDirty } from "./context.js";
import { uploadBuffers, createGpuSystem } from "./sync.js";
import type { GpuKernelDef } from "./kernel.js";

// ---------------------------------------------------------------------------
// Mock WebGPU
// ---------------------------------------------------------------------------

function createMockBuffer(size: number, label?: string): GPUBuffer {
  return {
    size,
    label: label ?? "",
    usage: 0,
    mapState: "unmapped" as GPUBufferMapState,
    destroy: vi.fn(),
    getMappedRange: vi.fn(() => new ArrayBuffer(size)),
    mapAsync: vi.fn(() => Promise.resolve()),
    unmap: vi.fn(),
  } as unknown as GPUBuffer;
}

function createMockGpuContext(): GpuContext {
  const mockDevice = {
    createBuffer: vi.fn((desc: { size: number; label?: string }) =>
      createMockBuffer(desc.size, desc.label),
    ),
    createShaderModule: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({})),
    })),
    createBindGroup: vi.fn(() => ({})),
    createCommandEncoder: vi.fn(() => ({
      beginComputePass: vi.fn(() => ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        dispatchWorkgroups: vi.fn(),
        end: vi.fn(),
      })),
      copyBufferToBuffer: vi.fn(),
      finish: vi.fn(() => ({})),
    })),
    destroy: vi.fn(),
    queue: {
      writeBuffer: vi.fn(),
      submit: vi.fn(),
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

// ---------------------------------------------------------------------------
// Test components
// ---------------------------------------------------------------------------

const Transform = defineComponent({
  px: Float32Array,
  py: Float32Array,
  pz: Float32Array,
});

const Velocity = defineComponent({
  vx: Float32Array,
  vy: Float32Array,
  vz: Float32Array,
});

const GpuRigidBody = defineTag();

const GpuForce = defineComponent({
  fx: Float32Array,
  fy: Float32Array,
  fz: Float32Array,
});

beforeEach(() => {
  resetComponentIdCounter();
});

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

describe("uploadBuffers", () => {
  it("uploads dirty components to GPU buffers", () => {
    const gpu = createMockGpuContext();
    const world = createWorld(64);
    const eid = addEntity(world);
    addComponent(world, eid, Transform, { px: 1, py: 2, pz: 3 });
    addComponent(world, eid, Velocity, { vx: 0.5, vy: 0, vz: 0 });

    markCpuDirty(gpu, Transform.id);
    markCpuDirty(gpu, Velocity.id);

    const kernel: GpuKernelDef = {
      name: "test",
      query: [Transform, Velocity],
      read: [Velocity],
      write: [Transform],
      wgsl: "",
    };

    uploadBuffers(gpu, world, kernel);

    // writeBuffer called for each dirty component field
    // Transform: px, py, pz (dirty) + Velocity: vx, vy, vz (dirty) = 6 calls
    expect(gpu.queue.writeBuffer).toHaveBeenCalledTimes(6);
  });

  it("skips non-dirty components", () => {
    const gpu = createMockGpuContext();
    const world = createWorld(64);
    const eid = addEntity(world);
    addComponent(world, eid, Transform, { px: 1, py: 2, pz: 3 });
    addComponent(world, eid, Velocity, { vx: 0.5, vy: 0, vz: 0 });

    // Only Transform is dirty
    markCpuDirty(gpu, Transform.id);

    const kernel: GpuKernelDef = {
      name: "test",
      query: [Transform, Velocity],
      read: [Velocity],
      write: [Transform],
      wgsl: "",
    };

    uploadBuffers(gpu, world, kernel);

    // Only Transform fields uploaded (3 calls), not Velocity
    expect(gpu.queue.writeBuffer).toHaveBeenCalledTimes(3);
  });

  it("clears dirty flags after upload", () => {
    const gpu = createMockGpuContext();
    const world = createWorld(64);
    const eid = addEntity(world);
    addComponent(world, eid, Transform, { px: 1, py: 2, pz: 3 });

    markCpuDirty(gpu, Transform.id);

    const kernel: GpuKernelDef = {
      name: "test",
      query: [Transform],
      read: [],
      write: [Transform],
      wgsl: "",
    };

    uploadBuffers(gpu, world, kernel);

    expect(gpu.cpuDirty.has(Transform.id)).toBe(false);
  });

  it("creates buffers if they do not exist", () => {
    const gpu = createMockGpuContext();
    const world = createWorld(64);
    const eid = addEntity(world);
    addComponent(world, eid, Transform, { px: 1, py: 2, pz: 3 });

    markCpuDirty(gpu, Transform.id);

    const kernel: GpuKernelDef = {
      name: "test",
      query: [Transform],
      read: [],
      write: [Transform],
      wgsl: "",
    };

    expect(gpu.buffers.size).toBe(0);
    uploadBuffers(gpu, world, kernel);
    expect(gpu.buffers.size).toBe(3); // px, py, pz
  });
});

// ---------------------------------------------------------------------------
// createGpuSystem
// ---------------------------------------------------------------------------

describe("createGpuSystem", () => {
  it("returns null when gpu is null", () => {
    const kernel: GpuKernelDef = {
      name: "test",
      query: [Transform],
      read: [],
      write: [Transform],
      wgsl: "",
    };

    const system = createGpuSystem(null, kernel, null);
    expect(system).toBeNull();
  });

  it("registers write claims when authority tag is provided", () => {
    const gpu = createMockGpuContext();
    const kernel: GpuKernelDef = {
      name: "gpuPhysics",
      query: [GpuRigidBody, Transform, Velocity],
      read: [GpuForce],
      write: [Transform, Velocity],
      wgsl: "",
    };

    createGpuSystem(gpu, kernel, GpuRigidBody);

    // Write claims registered for Transform and Velocity
    expect(gpu.writeClaims.has(Transform.id)).toBe(true);
    expect(gpu.writeClaims.has(Velocity.id)).toBe(true);
    expect(gpu.writeClaims.get(Transform.id)![0]!.owner).toBe("gpuPhysics");
  });

  it("marks all kernel components as initially cpu-dirty", () => {
    const gpu = createMockGpuContext();
    const kernel: GpuKernelDef = {
      name: "test",
      query: [Transform, Velocity],
      read: [Velocity],
      write: [Transform],
      wgsl: "",
    };

    createGpuSystem(gpu, kernel, null);

    expect(gpu.cpuDirty.has(Transform.id)).toBe(true);
    expect(gpu.cpuDirty.has(Velocity.id)).toBe(true);
  });

  it("returns a SystemFn that can be called", () => {
    const gpu = createMockGpuContext();
    const world = createWorld(64);
    const eid = addEntity(world);
    addComponent(world, eid, Transform, { px: 1, py: 2, pz: 3 });
    addComponent(world, eid, Velocity, { vx: 0.1, vy: 0, vz: 0 });

    const kernel: GpuKernelDef = {
      name: "test",
      query: [Transform, Velocity],
      read: [Velocity],
      write: [Transform],
      wgsl: "let eid = indices[id.x];",
    };

    const system = createGpuSystem(gpu, kernel, null);
    expect(system).not.toBeNull();

    // Should not throw
    system!(world, 0.016);

    // Should have submitted work
    expect(gpu.queue.submit).toHaveBeenCalled();
  });

  it("does not register write claims when authority tag is null", () => {
    const gpu = createMockGpuContext();
    const kernel: GpuKernelDef = {
      name: "test",
      query: [Transform],
      read: [],
      write: [Transform],
      wgsl: "",
    };

    createGpuSystem(gpu, kernel, null);

    expect(gpu.writeClaims.size).toBe(0);
  });
});
