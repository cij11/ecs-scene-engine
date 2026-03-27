# bevy_gpu_compute — Insights for Transpilation API

## What it is
A Bevy plugin that lets you write GPU compute tasks in Rust without learning WGSL. Proc-macro transpiles attributed Rust → WGSL.

## Why it matters for us
Cleanest API design for "define a GPU task, set inputs, run, read results". The create→run→read pattern maps well to our system pipeline.

## Key architectural decisions

### 1. Attributed struct declarations
```rust
#[wgsl_input_array]   // → storage buffer, dynamic array
struct Position { pub v: Vec2F32 }

#[wgsl_config]         // → uniform buffer, fixed
struct Settings { threshold: f32 }

#[wgsl_output_vec]     // → dynamic output (atomic append)
struct CollisionResult { entity1: u32, entity2: u32 }

#[wgsl_output_array]   // → fixed-size output (faster)
struct GridCell { density: f32 }
```

### 2. IterationSpace for dispatch
```rust
let space = IterationSpace::new(100, 100, 1); // 10,000 parallel tasks
```
Maps directly to workgroup dispatch dimensions. For collision detection: NxN grid of entity pairs.

### 3. MaxOutputLengths specified upfront
Dynamic outputs (wgsl_output_vec) require max size declaration before dispatch. This pre-allocates GPU buffers.

### 4. Type-safe builder pattern
```rust
let input = collision_module::InputDataBuilder::new()
    .set_position(positions)
    .set_radius(radii)
    .into();
```
Generated builders ensure all required inputs are set before dispatch.

### 5. Helper functions in WGSL
- `WgslVecInput::vec_val::<T>(index)` — read from input array
- `WgslVecInput::vec_len::<T>()` — query array length
- `WgslOutput::push::<T>(value)` — atomic append to output vector

## Performance
50% better than CPU in collision detection benchmark. Overhead from abstraction is real but acceptable.

## What we should adopt
- The create→setInputs→run→readResults lifecycle
- IterationSpace concept (we'd call it dispatch dimensions)
- The distinction between fixed-size outputs (arrays) and dynamic outputs (vecs with atomic append)
- Max output size declaration for dynamic outputs

## What we should skip
- Proc-macro transpilation — we're TypeScript, not Rust. Our DSL/builder approach is the equivalent.
- The module-level shader declaration pattern (too coupled to Rust macros)
