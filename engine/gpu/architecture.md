# GPU Compute System — Architecture Document

## 1. Overview

This document defines how WebGPU compute shaders integrate with the ECS engine. The goal is to allow systems to run on the GPU while sharing components with CPU-bound systems, using the existing SoA TypedArray storage as the data bridge.

**Prefix convention:** All GPU components, systems, and types use the `gpu` prefix (e.g., `GpuParticleLife`, `gpuMovementSystem`) to avoid blocking existing CPU-bound development. Once proven, the prefix can be removed.

**Reference implementations studied:**
- TypeGPU — schema-driven types, lazy pipeline resolution
- bevy_hanabi — 4-pass GPU particle pipeline, zero CPU sync, indirect dispatch
- bevy_gpu_compute — create→run→read API pattern
- GPU Gems Ch.32 — sort-based broadphase collision with spatial hashing
- Unity GPU Physics — 7-kernel multi-pass pipeline with atomic grid insertion

---

## 2. Data Flow

```
CPU World (SoA TypedArrays)
  │
  │  ① uploadBuffers()
  │  Dirty CPU TypedArrays → queue.writeBuffer() → GPUBuffers
  │
  ▼
GPU Storage Buffers
  │
  │  ② dispatchKernel()
  │  Command encoder → compute pass → dispatch workgroups → submit
  │
  ▼
GPU Storage Buffers (modified)
  │
  │  ③ readbackBuffers()
  │  Staging buffer → mapAsync → copy into CPU TypedArrays
  │
  ▼
CPU World (SoA TypedArrays updated)
```

### Upload path
Each ECS component field (e.g., `Transform.px`) is a `Float32Array`. The corresponding `GPUBuffer` has `STORAGE | COPY_DST` usage. `queue.writeBuffer(gpuBuf, 0, typedArray)` performs the upload.

### Readback path
GPU-written buffers need `STORAGE | COPY_SRC` usage. A staging buffer with `MAP_READ | COPY_DST` receives the data via `copyBufferToBuffer`, then `mapAsync(GPUMapMode.READ)` makes it accessible. The mapped range is copied back into the CPU TypedArray.

### GPU-authoritative components
Components marked GPU-authoritative (e.g., `GpuParticleLife`) skip readback unless explicitly requested. This avoids per-frame async stalls for data the CPU never needs.

---

## 3. Pipeline Phase Integration

The existing pipeline runs phases in order:

```
preUpdate → update → postUpdate → preRender → cleanup
```

GPU systems integrate as follows:

```
preUpdate     ← CPU systems (input handling, entity spawning, mark dirty)
    ↓
    ↓  [uploadBuffers: dirty CPU components → GPU]
    ↓
update        ← GPU systems (particle sim, physics passes)
    ↓
    ↓  [readbackBuffers: GPU-written components → CPU]
    ↓
postUpdate    ← CPU systems (game logic that reads Transform, etc.)
preRender     ← view sync (reads Transform for renderer)
cleanup       ← deferred removals, commit query changes
```

Upload happens automatically before the first GPU system in the `update` phase. Readback happens after the last GPU system completes, before `postUpdate`.

### Sync point implementation

A `gpuSyncSystem` is registered at the boundary:

```typescript
// Registered internally when any gpuSystem is added
addSystem(world, "update", gpuUploadSystem);    // first in update
addSystem(world, "update", ...gpuSystems);       // user GPU systems
addSystem(world, "postUpdate", gpuReadbackSystem); // first in postUpdate
```

---

## 4. GpuContext

Manages WebGPU device lifecycle and the buffer pool.

### Interface

```typescript
interface GpuContext {
  device: GPUDevice;
  queue: GPUQueue;

  // Buffer pool: "componentId:fieldName" → GPUBuffer
  buffers: Map<string, GPUBuffer>;

  // Track which components need upload/readback
  cpuDirty: Set<number>;    // component IDs modified on CPU
  gpuDirty: Set<number>;    // component IDs modified on GPU

  // Components that live on GPU — skip readback
  gpuAuthoritative: Set<number>;
}
```

### Lifecycle

1. **Init**: `createGpuContext()` calls `navigator.gpu.requestAdapter()` → `requestDevice()`. Returns `null` if WebGPU unavailable (graceful fallback — GPU systems silently become no-ops, CPU systems continue).
2. **Buffer creation**: Lazy — buffers created on first use when a `gpuSystem` dispatches. Keyed by component ID + field name.
3. **Buffer growth**: When `ensureCapacity` grows a component's TypedArrays, the corresponding GPUBuffers are recreated at the new size. Old buffers destroyed.
4. **Destroy**: `destroyGpuContext()` destroys all buffers and loses the device.

### Design decision: Lazy buffer creation

**Adopted from:** TypeGPU's lazy pipeline resolution.
**Rejected alternative:** Bevy's eager extract-every-frame model — too much upfront cost for our use case where most components are CPU-only.
**Rationale:** Most components will never touch the GPU. Creating buffers eagerly for all components wastes VRAM. Creating on first dispatch means only GPU-involved components get buffers.

---

## 5. GpuKernelDef — The Kernel DSL

### Interface

```typescript
interface GpuKernelDef {
  name: string;
  query: QueryTerm[];              // which entities (provides dispatch indices)
  read: ComponentDef[];            // components bound as read-only storage
  write: ComponentDef[];           // components bound as read-write storage
  uniforms?: Record<string, WgslType>;  // uniform values (dt, gravity, etc.)
  workgroupSize?: number;          // default 64
  wgsl: string;                    // WGSL body snippet
}

type WgslType = 'f32' | 'u32' | 'i32' | 'vec2f' | 'vec3f' | 'vec4f';
```

### How queries provide dispatch indices

The ECS query (e.g., `[GpuParticleTag, Transform, Velocity]`) produces a dense array of entity indices. This array is uploaded as a `storage<read>` buffer of `array<u32>`. The compute shader's `global_invocation_id.x` indexes into this array to get the entity index, which then indexes into the component field arrays.

```wgsl
let eid = indices[id.x];        // entity index from query
px[eid] = px[eid] + vx[eid] * uniforms.dt;  // index into component arrays
```

This means the GPU only processes entities that match the query, not the entire component array.

### How component schemas map to WGSL bindings

Each field in a component's schema becomes a separate `var<storage>` binding:

```
defineComponent({ px: Float32Array, py: Float32Array, pz: Float32Array })
                    ↓                  ↓                  ↓
@binding(N) var<storage, read_write> px: array<f32>;
@binding(N+1) var<storage, read_write> py: array<f32>;
@binding(N+2) var<storage, read_write> pz: array<f32>;
```

TypedArray constructor maps to WGSL type:
| TypedArray | WGSL |
|-----------|------|
| Float32Array | f32 |
| Float64Array | f32 (downcast — WGSL has no f64) |
| Int32Array | i32 |
| Uint32Array | u32 |
| Int16Array | i32 (widened) |
| Uint16Array | u32 (widened) |
| Int8Array | i32 (widened) |
| Uint8Array | u32 (widened) |

### Field name uniqueness

Our existing components already use unique field names by convention (`px`, `py`, `pz` for Transform; `vx`, `vy`, `vz` for Velocity). If two components in the same kernel share a field name, the generator namespaces them: `{componentName}_{fieldName}`.

The generator detects collisions and only namespaces when necessary, keeping the common case clean.

### Binding layout order

```
Group 0:
  @binding(0) — Uniforms struct (if any)
  @binding(1) — indices: array<u32> (query results)
  @binding(2..) — read component fields (in component order, then field order)
  @binding(N..) — write component fields (same ordering)
```

Read-only components use `var<storage, read>`. Write components use `var<storage, read_write>` (WGSL requires read access for read-modify-write patterns like `px[eid] = px[eid] + ...`).

---

## 6. WGSL Code Generation

`generateWgsl(kernel: GpuKernelDef): string` produces a complete, valid WGSL module:

1. Emit uniform struct (if `kernel.uniforms` defined)
2. Emit uniform binding
3. Emit index buffer binding
4. For each read component, emit field bindings as `var<storage, read>`
5. For each write component, emit field bindings as `var<storage, read_write>`
6. Emit `@compute @workgroup_size(N) fn main(@builtin(global_invocation_id) id: vec3u)`
7. Emit dispatch guard: `if (id.x >= arrayLength(&indices)) { return; }`
8. Emit user's WGSL body snippet

### Example: movement kernel

Input:
```typescript
const gpuMovementKernel: GpuKernelDef = {
  name: 'gpu_movement',
  query: [GpuMovementTag, Transform, Velocity],
  read: [Velocity],
  write: [Transform],
  uniforms: { dt: 'f32' },
  wgsl: `
    let eid = indices[id.x];
    px[eid] = px[eid] + vx[eid] * uniforms.dt;
    py[eid] = py[eid] + vy[eid] * uniforms.dt;
    pz[eid] = pz[eid] + vz[eid] * uniforms.dt;
  `
};
```

Output:
```wgsl
struct Uniforms {
  dt: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> indices: array<u32>;
@group(0) @binding(2) var<storage, read> vx: array<f32>;
@group(0) @binding(3) var<storage, read> vy: array<f32>;
@group(0) @binding(4) var<storage, read> vz: array<f32>;
@group(0) @binding(5) var<storage, read_write> px: array<f32>;
@group(0) @binding(6) var<storage, read_write> py: array<f32>;
@group(0) @binding(7) var<storage, read_write> pz: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&indices)) { return; }
  let eid = indices[id.x];
  px[eid] = px[eid] + vx[eid] * uniforms.dt;
  py[eid] = py[eid] + vy[eid] * uniforms.dt;
  pz[eid] = pz[eid] + vz[eid] * uniforms.dt;
}
```

### Pipeline compilation

`device.createShaderModule({ code: wgsl })` compiles the WGSL. `device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } })` creates the pipeline. Both are cached per kernel name — recompilation only on kernel definition change.

---

## 7. Shared Component Ownership

### The question
Can a GPU system and a CPU system both write to `Transform`?

### The answer
Yes — via **entity-set partitioning**. The ECS query system guarantees disjoint entity sets:

```
GPU system queries [GpuParticleTag, Transform, Velocity] → entities 100..10099
CPU system queries [PlayerTag, Transform, Velocity]       → entities 0..4
```

Same `Transform.px` TypedArray, different index ranges. No write conflict.

### Rules

1. **Same component, disjoint entities**: Always safe. Queries partition the entity set. This is the primary pattern.
2. **Same component, same entity, different phases**: Safe if readback completes between phases. GPU writes in `update`, CPU reads in `postUpdate` after readback.
3. **Same component, same entity, same phase**: Undefined behavior. The system does not prevent this — it's the same rule as two CPU systems writing the same component on the same entity (also undefined in our engine).

### The gpu prefix strategy

During development, GPU-specific components use the `gpu` prefix:
- `GpuParticleTag` — tag marking GPU-managed particles
- `GpuParticleLife` — particle aging (GPU-authoritative, no readback)
- `GpuParticleVisual` — particle color/alpha (GPU-authoritative)

Shared components like `Transform` and `Velocity` are NOT duplicated — the whole point is that GPU systems write to the same `Transform` that the renderer reads.

---

## 8. Multi-Pass Dispatch

For physics and other multi-pass workloads, multiple kernels execute in a single command encoder:

```typescript
function gpuPhysicsSystem(gpu: GpuContext, world: World, dt: number) {
  const encoder = gpu.device.createCommandEncoder();

  // Pass 1: clear spatial grid
  dispatchPass(encoder, clearGridPipeline, clearGridBindGroup, gridCells);

  // Pass 2: populate grid from positions
  dispatchPass(encoder, populateGridPipeline, populateBindGroup, entityCount);

  // Pass 3: narrowphase collision + impulse response
  dispatchPass(encoder, collisionPipeline, collisionBindGroup, entityCount);

  // Pass 4: Verlet integration (N substeps in GPU loop)
  dispatchPass(encoder, integratePipeline, integrateBindGroup, entityCount);

  gpu.queue.submit([encoder.finish()]);
}
```

Implicit barriers between `beginComputePass()`/`end()` calls ensure correct ordering. No CPU round-trips — all passes run on GPU in a single submit.

### Design decision: Grid-based vs sort-based broadphase

**Adopted:** Unity GPU Physics grid pattern (atomic compare-exchange, 4 entities per cell, 27-neighbor search).
**Rejected for PoC:** GPU Gems sort-based approach (parallel radix sort + prefix sums).
**Rationale:** The grid approach is simpler (~50 lines of WGSL vs ~300 for radix sort), with the tradeoff that >4 entities per cell means missed collisions. For our PoC with sphere colliders this is acceptable. If dense scenes require it, we can migrate to sort-based later — the kernel DSL makes swapping implementations straightforward.

---

## 9. Edge Cases

### WebGPU unavailable
`createGpuContext()` returns `null`. `createGpuSystem()` returns a no-op `SystemFn` that logs a warning once. CPU systems continue to work. The `gpu` prefix convention means there are always CPU fallbacks for shared behavior.

### Buffer resize during frame
If `ensureCapacity` grows component storage mid-frame (e.g., entities added in `preUpdate`), the `gpuUploadSystem` detects the capacity mismatch, destroys old GPUBuffers, creates new ones at the new size, and uploads the full array. This is expensive but rare — capacity doubles, so it happens O(log N) times total.

### Entity destruction mid-frame
Entities destroyed during a GPU dispatch are handled by the existing deferred removal system. The GPU processes a snapshot of the query results (the index buffer uploaded at frame start). Destroyed entities may get one extra frame of processing — acceptable since their data is zeroed on destruction anyway.

### Float64Array downcast
WGSL has no `f64` type. `Float64Array` components are downcast to `f32` on upload. This loses precision but is the only option for GPU processing. If a component requires f64 precision, it must stay CPU-only.

---

## 10. File Structure

```
engine/gpu/
  architecture.md     ← this document
  context.ts          ← GpuContext: device, queue, buffer pool, dirty tracking
  kernel.ts           ← GpuKernelDef interface, generateWgsl()
  sync.ts             ← uploadBuffers, readbackBuffers, gpuSyncSystem
  system.ts           ← createGpuSystem(), pipeline integration
  types.ts            ← WgslType, buffer key helpers
  components/
    particle.ts       ← GpuParticleTag, GpuParticleLife, GpuParticleVisual
    physics.ts        ← GpuRigidBody, GpuCollider
  systems/
    particle.ts       ← gpuParticleIntegrateKernel
    physics.ts        ← broadphase, narrowphase, integrate kernels
```

---

## 11. Review Checklist

- [ ] GpuKernelDef interface covers all necessary fields
- [ ] WGSL generation strategy handles all TypedArray types
- [ ] GpuContext API handles init, growth, destroy
- [ ] Buffer sync protocol has clear upload/readback timing
- [ ] Pipeline phase integration doesn't break existing CPU systems
- [ ] Shared component ownership rules are unambiguous
- [ ] Data flow diagram is accurate
- [ ] Edge cases documented: no WebGPU, resize, entity destruction, f64
- [ ] Reference project patterns cited with adoption/rejection rationale
- [ ] A kernel can be defined in <20 lines of code
