# GPU Physics Unity — Collision Pipeline Insights

Study of `Assets/Physics/GPUPhysicsComputeShader.compute` focusing on the GPU collision detection and response approach.

## Pipeline Overview

The Unity GPU Physics project uses a 6-kernel pipeline:

1. **GenerateParticleValues** — per rigid body: compute world-space particle positions from body position + quaternion rotation
2. **ClearGrid** — per cell: reset voxel grid to -1
3. **PopulateGrid** — per particle: hash position into grid using atomic compare-exchange
4. **CollisionDetection** — per particle: check 27 neighbors, accumulate forces into a **separate force buffer**
5. **ComputeMomenta** — per rigid body: sum particle forces into linear + angular force, integrate velocity
6. **ComputePositionAndRotation** — per rigid body: integrate position and quaternion

## Key Design Decisions

### 1. Spatial Hash Grid with int4 Cells (4 slots per cell)

The grid uses `int4` (equivalent to our `MAX_PER_CELL = 4`):
```hlsl
RWStructuredBuffer<int4> voxelCollisionGrid;
```

Population uses the same atomic compare-exchange-weak pattern as our implementation. This is the standard approach confirmed by both GPU Gems and this project.

**4 slots per cell is the industry standard for GPU spatial hashing.** More slots waste memory; fewer cause overflow in dense scenes.

### 2. Force-Based Collision (Spring-Damper), NOT Impulse-Based

This is a critical difference from both Godot and our implementation. Unity GPU Physics uses a **penalty force** model:

- **Repulsive (spring) force**: `-springCoefficient * (diameter - distance) * normal` (Equation 10)
- **Damping force**: `dampingCoefficient * relativeVelocity` (Equation 11)
- **Tangential force**: `tangentialCoefficient * tangentialVelocity` (Equation 12)

Forces are accumulated per-particle, then summed per-rigid-body in a separate kernel.

### 3. Force Accumulation, Not Velocity Modification

The collision kernel writes ONLY to `particleForces[]` — it does NOT modify velocities or positions. This is the same principle as Agent B's impulse buffer approach, but expressed as forces instead of impulses.

This eliminates the race condition entirely: each particle writes only to its own force slot, and forces are naturally additive.

### 4. Rigid Body = Collection of Particles

Each rigid body is represented as multiple particles in fixed relative positions. Angular velocity is computed from cross products of particle forces with their relative positions. This is a particle-based rigid body method (similar to shape matching).

Not relevant for our current sphere-only system, but interesting for future rigid body support.

### 5. 27-Cell Neighbor Check (Unrolled)

The neighbor check is manually unrolled (27 explicit calls to `_checkGridCell`) rather than using nested loops. This is a GPU optimization — loop unrolling avoids branch divergence in SIMD warps. However, WGSL compilers typically handle this automatically.

## Comparison with Our Implementation

| Aspect | Unity GPU Physics | Our Packed Pipeline |
|--------|------------------|-------------------|
| Collision model | Spring-Damper (penalty force) | Impulse-based |
| Output buffer | Force buffer | Impulse buffer |
| Grid structure | int4 (4 slots) | 4 slots per cell |
| Population | Atomic CAS | Atomic CAS |
| Neighbor search | 27-cell unrolled | 27-cell nested loop |
| Integration | Separate kernel | Separate kernel |
| Bodies | Multi-particle rigid bodies | Single particles |

## Recommendations

1. **Our impulse approach is fine** — both penalty forces and impulses work. Impulse-based is simpler for our use case (no tuning spring/damper coefficients).
2. **The 4-slot grid is validated** — both Unity GPU Physics and our implementation use the same structure. This is correct.
3. **Force/impulse separation is validated** — writing to a separate buffer and applying later is the standard GPU-safe pattern.
4. **Consider unrolling the 27-cell loop** if performance profiling shows it matters. For now, nested loops are clearer.
