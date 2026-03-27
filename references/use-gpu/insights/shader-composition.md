# Use.GPU — Insights for Shader Composition

## What it is
A WGSL shader linker with functional composition, module system, and dead code elimination. No privileged built-in shaders — everything composes equally.

## Why it matters for us
When we have multiple GPU kernels (particle update, broadphase, narrowphase, integration), we'll want to share code between them (spatial hash functions, quaternion math, etc). Use.GPU's linking model solves this.

## Key architectural decisions

### 1. Module system with @link directives
```wgsl
@link fn getSize(index: u32) -> f32 { return 1.0; }
```
Runtime linking — the linker auto-generates bindings based on data source type:
- Null → default impl
- Constant → uniform + getter
- Array → storage binding
- Function → recursive shader substitution

### 2. Data getter pattern
Shaders define `index => value` functions instead of classic vertex attributes. The linker decides how to bind data (storage buffer, uniform, texture) based on what's provided.

### 3. Structural hashing for memoization
Single linear pass per module. Shaders and pipelines memoized by structural hash. Multiple instances within same shader get instance hashes.

### 4. Static vs volatile bind groups
- Static: infrequently changing, requires re-render to update
- Volatile: frame-to-frame changes, evaluated just-in-time with LRU cache

### 5. Duck-typed type inference
```wgsl
@infer type T;
@link fn getVertex(index: u32) -> @infer(T) T {};
fn main() {
  let vertex: T = getVertex(0);
  let pos = vertex.position; // Works with any T containing .position
}
```

## What we should adopt
- The @link concept for shared utility functions (spatial hash, quaternion multiply, etc.)
- Structural hashing for pipeline cache keys
- The idea that all shaders are equal (no privileged built-ins)

## What we should skip
- The full reactive/React-style hook system — overkill for our ECS
- GLSL support (we're WGSL only)
