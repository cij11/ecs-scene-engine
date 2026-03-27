import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetComponentIdCounter, defineComponent, defineTag } from "../ecs/component.js";
import { createWorld, addEntity, addComponent } from "../ecs/world.js";
import type { GpuContext } from "./context.js";
import {
  ensureBuffer,
  ensureComponentBuffers,
  getBuffer,
  markCpuDirty,
  markGpuDirty,
  markGpuAuthoritative,
  registerWriteClaim,
  checkWriteAuthority,
  destroyGpuContext,
} from "./context.js";
import { bufferKey, GPU_BUFFER_USAGE } from "./types.js";

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
    getMappedRange: vi.fn(),
    mapAsync: vi.fn(),
    unmap: vi.fn(),
  } as unknown as GPUBuffer;
}

function createMockGpuContext(opts?: { devMode?: boolean }): GpuContext {
  const mockDevice = {
    createBuffer: vi.fn((desc: { size: number; usage: number; label?: string }) =>
      createMockBuffer(desc.size, desc.label),
    ),
    destroy: vi.fn(),
    queue: {
      writeBuffer: vi.fn(),
      submit: vi.fn(),
      onSubmittedWorkDone: vi.fn(),
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
    devMode: opts?.devMode ?? true,
  };
}

// ---------------------------------------------------------------------------
// Components for testing
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
const GpuParticleTag = defineTag();

beforeEach(() => {
  resetComponentIdCounter();
});

// ---------------------------------------------------------------------------
// Buffer pool
// ---------------------------------------------------------------------------

describe("buffer pool", () => {
  it("creates a buffer on first call", () => {
    const gpu = createMockGpuContext();
    const buf = ensureBuffer(gpu, 0, "px", 4096, GPU_BUFFER_USAGE.STORAGE);

    expect(buf).toBeDefined();
    expect(buf.size).toBe(4096);
    expect(gpu.device.createBuffer).toHaveBeenCalledOnce();
    expect(gpu.buffers.size).toBe(1);
  });

  it("reuses existing buffer if large enough", () => {
    const gpu = createMockGpuContext();
    const buf1 = ensureBuffer(gpu, 0, "px", 4096, GPU_BUFFER_USAGE.STORAGE);
    const buf2 = ensureBuffer(gpu, 0, "px", 2048, GPU_BUFFER_USAGE.STORAGE);

    expect(buf2).toBe(buf1);
    expect(gpu.device.createBuffer).toHaveBeenCalledOnce();
  });

  it("recreates buffer when capacity grows", () => {
    const gpu = createMockGpuContext();
    const buf1 = ensureBuffer(gpu, 0, "px", 4096, GPU_BUFFER_USAGE.STORAGE);
    const buf2 = ensureBuffer(gpu, 0, "px", 8192, GPU_BUFFER_USAGE.STORAGE);

    expect(buf2).not.toBe(buf1);
    expect(buf1.destroy).toHaveBeenCalledOnce();
    expect(buf2.size).toBe(8192);
    expect(gpu.device.createBuffer).toHaveBeenCalledTimes(2);
  });

  it("creates separate buffers per component field", () => {
    const gpu = createMockGpuContext();
    ensureBuffer(gpu, 0, "px", 4096, GPU_BUFFER_USAGE.STORAGE);
    ensureBuffer(gpu, 0, "py", 4096, GPU_BUFFER_USAGE.STORAGE);
    ensureBuffer(gpu, 0, "pz", 4096, GPU_BUFFER_USAGE.STORAGE);

    expect(gpu.buffers.size).toBe(3);
    expect(gpu.device.createBuffer).toHaveBeenCalledTimes(3);
  });

  it("getBuffer returns undefined for non-existent buffer", () => {
    const gpu = createMockGpuContext();
    expect(getBuffer(gpu, 99, "nonexistent")).toBeUndefined();
  });

  it("getBuffer returns existing buffer", () => {
    const gpu = createMockGpuContext();
    const buf = ensureBuffer(gpu, 0, "px", 4096, GPU_BUFFER_USAGE.STORAGE);
    expect(getBuffer(gpu, 0, "px")).toBe(buf);
  });

  it("ensureComponentBuffers creates buffers for all fields", () => {
    const gpu = createMockGpuContext();
    const world = createWorld(64);
    addComponent(world, addEntity(world), Transform, { px: 1, py: 2, pz: 3 });

    ensureComponentBuffers(gpu, Transform, world.components, false);

    expect(getBuffer(gpu, Transform.id, "px")).toBeDefined();
    expect(getBuffer(gpu, Transform.id, "py")).toBeDefined();
    expect(getBuffer(gpu, Transform.id, "pz")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Dirty tracking
// ---------------------------------------------------------------------------

describe("dirty tracking", () => {
  it("markCpuDirty adds component to cpuDirty set", () => {
    const gpu = createMockGpuContext();
    markCpuDirty(gpu, Transform.id);

    expect(gpu.cpuDirty.has(Transform.id)).toBe(true);
    expect(gpu.cpuDirty.has(Velocity.id)).toBe(false);
  });

  it("markGpuDirty adds component to gpuDirty set", () => {
    const gpu = createMockGpuContext();
    markGpuDirty(gpu, Transform.id);

    expect(gpu.gpuDirty.has(Transform.id)).toBe(true);
  });

  it("markGpuAuthoritative adds component to gpuAuthoritative set", () => {
    const gpu = createMockGpuContext();
    markGpuAuthoritative(gpu, 42);

    expect(gpu.gpuAuthoritative.has(42)).toBe(true);
  });

  it("dirty sets are independent", () => {
    const gpu = createMockGpuContext();
    markCpuDirty(gpu, Transform.id);
    markGpuDirty(gpu, Velocity.id);

    expect(gpu.cpuDirty.has(Transform.id)).toBe(true);
    expect(gpu.cpuDirty.has(Velocity.id)).toBe(false);
    expect(gpu.gpuDirty.has(Velocity.id)).toBe(true);
    expect(gpu.gpuDirty.has(Transform.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Write claims / authority guards
// ---------------------------------------------------------------------------

describe("write claims", () => {
  it("registerWriteClaim adds a claim", () => {
    const gpu = createMockGpuContext();
    registerWriteClaim(gpu, Transform, GpuRigidBody, "gpuPhysics");

    const claims = gpu.writeClaims.get(Transform.id);
    expect(claims).toHaveLength(1);
    expect(claims![0]!.owner).toBe("gpuPhysics");
    expect(claims![0]!.requiredTag).toBe(GpuRigidBody);
  });

  it("multiple claims can be registered for the same component", () => {
    const gpu = createMockGpuContext();
    registerWriteClaim(gpu, Transform, GpuRigidBody, "gpuPhysics");
    registerWriteClaim(gpu, Transform, GpuParticleTag, "gpuParticles");

    const claims = gpu.writeClaims.get(Transform.id);
    expect(claims).toHaveLength(2);
  });
});

describe("authority guards", () => {
  it("throws when CPU writes to a GPU-owned component on a tagged entity", () => {
    const gpu = createMockGpuContext();
    const world = createWorld(64);
    const eid = addEntity(world);
    addComponent(world, eid, Transform, { px: 0, py: 0, pz: 0 });
    addComponent(world, eid, GpuRigidBody);

    registerWriteClaim(gpu, Transform, GpuRigidBody, "gpuPhysics");

    expect(() => {
      checkWriteAuthority(gpu, world, Transform.id, eid);
    }).toThrow(/Authority violation/);
  });

  it("does not throw for entities without the authority tag", () => {
    const gpu = createMockGpuContext();
    const world = createWorld(64);
    const eid = addEntity(world);
    addComponent(world, eid, Transform, { px: 0, py: 0, pz: 0 });
    // No GpuRigidBody tag

    registerWriteClaim(gpu, Transform, GpuRigidBody, "gpuPhysics");

    expect(() => {
      checkWriteAuthority(gpu, world, Transform.id, eid);
    }).not.toThrow();
  });

  it("does not throw when devMode is false", () => {
    const gpu = createMockGpuContext({ devMode: false });
    const world = createWorld(64);
    const eid = addEntity(world);
    addComponent(world, eid, Transform, { px: 0, py: 0, pz: 0 });
    addComponent(world, eid, GpuRigidBody);

    registerWriteClaim(gpu, Transform, GpuRigidBody, "gpuPhysics");

    expect(() => {
      checkWriteAuthority(gpu, world, Transform.id, eid);
    }).not.toThrow();
  });

  it("does not throw for components with no claims", () => {
    const gpu = createMockGpuContext();
    const world = createWorld(64);
    const eid = addEntity(world);
    addComponent(world, eid, Velocity, { vx: 1, vy: 0, vz: 0 });

    // No write claim registered for Velocity
    expect(() => {
      checkWriteAuthority(gpu, world, Velocity.id, eid);
    }).not.toThrow();
  });

  it("error message includes owner name and tag info", () => {
    const gpu = createMockGpuContext();
    const world = createWorld(64);
    const eid = addEntity(world);
    addComponent(world, eid, Transform);
    addComponent(world, eid, GpuRigidBody);

    registerWriteClaim(gpu, Transform, GpuRigidBody, "gpuPhysics");

    expect(() => {
      checkWriteAuthority(gpu, world, Transform.id, eid);
    }).toThrow(/gpuPhysics/);
  });
});

// ---------------------------------------------------------------------------
// bufferKey
// ---------------------------------------------------------------------------

describe("bufferKey", () => {
  it("produces unique keys for different fields", () => {
    expect(bufferKey(0, "px")).not.toBe(bufferKey(0, "py"));
  });

  it("produces unique keys for different components", () => {
    expect(bufferKey(0, "px")).not.toBe(bufferKey(1, "px"));
  });
});

// ---------------------------------------------------------------------------
// Destroy
// ---------------------------------------------------------------------------

describe("destroyGpuContext", () => {
  it("destroys all buffers and clears state", () => {
    const gpu = createMockGpuContext();
    const buf1 = ensureBuffer(gpu, 0, "px", 4096, GPU_BUFFER_USAGE.STORAGE);
    const buf2 = ensureBuffer(gpu, 0, "py", 4096, GPU_BUFFER_USAGE.STORAGE);
    markCpuDirty(gpu, 0);
    markGpuDirty(gpu, 1);
    markGpuAuthoritative(gpu, 2);
    registerWriteClaim(gpu, Transform, GpuRigidBody, "gpuPhysics");

    destroyGpuContext(gpu);

    expect(buf1.destroy).toHaveBeenCalledOnce();
    expect(buf2.destroy).toHaveBeenCalledOnce();
    expect(gpu.buffers.size).toBe(0);
    expect(gpu.cpuDirty.size).toBe(0);
    expect(gpu.gpuDirty.size).toBe(0);
    expect(gpu.gpuAuthoritative.size).toBe(0);
    expect(gpu.writeClaims.size).toBe(0);
    expect(gpu.device.destroy).toHaveBeenCalledOnce();
  });

  it("handles empty context gracefully", () => {
    const gpu = createMockGpuContext();
    expect(() => destroyGpuContext(gpu)).not.toThrow();
  });
});
