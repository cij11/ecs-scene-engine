# TypeGPU — Insights for GPU Compute ECS

## What it is
A modular WebGPU toolkit from Software Mansion. TypeScript-native shader authoring with type-safe GPU resource management. Compiles TypeScript to WGSL while maintaining type safety across CPU/GPU boundary.

## Why it matters for us
Closest match to our architecture — schema-based types (`d.f32`, `d.vec3f`, `d.struct`) are analogous to our `defineComponent({ px: Float32Array })`. If any project has solved "TypeScript ECS → GPU", it's this one.

## Key architectural decisions

### 1. Dual implementation pattern
Functions have both `normalImpl` (CPU execution) and `codegenImpl` (WGSL generation). Same code runs on CPU for testing or GPU for perf. Controlled by execution mode: `normal`, `codegen`, or `simulate`.

### 2. Two-phase compilation
- **Build time**: `'use gpu'` directive → Babel parse → compact Tinyest AST embedded in `$internal` metadata
- **Runtime**: ResolutionCtx retrieves AST → WgslGenerator → WGSL string → `device.createComputePipeline()`
- Pipeline memoization via WeakMemo — identical bindings reuse compiled pipelines

### 3. Schema-based type system
```typescript
const CircleData = d.struct({
  radius: d.f32,
  center: d.vec2f,
  color: d.vec4f,
}).$name('Circle');
```
Automatic alignment per WGSL rules. Validation tokens (`$validStorageSchema`, `$validUniformSchema`) enforced at compile time.

### 4. Usage flags as type constraints
`buffer.$usage('storage')` returns a type-narrowed handle. TypeScript intersection types prevent misuse (can't bind a storage buffer as uniform).

### 5. Lazy pipeline resolution
`unwrap()` defers GPU resource creation until first execution. Memoized for reuse.

## Buffer management
- Schema types auto-serialize via `typed-binary`
- Write: JS values → GPU buffer at creation or via queue.writeBuffer
- Read: `await buffer.read()` → JS values
- Escape hatch: `root.unwrap(tgpuBuffer)` → vanilla GPUBuffer

## What we should adopt
- Schema-driven WGSL generation from component definitions — our `defineComponent` schemas already have the type info
- Usage flag pattern for buffer access control
- Lazy pipeline compilation with memoization
- The `simulate` mode concept — run GPU kernels on CPU for testing

## What we should skip
- Build-time Babel transform — too much tooling complexity for our use case. A DSL/builder is simpler.
- The full type system (we already have our own component system)
