# Unity GPU Physics — Insights for Compute Pipeline

## What it is
A Unity project demonstrating GPU rigid body physics via 7 compute shader kernels with spatial grid collision detection.

## Why it matters for us
Concrete, readable implementation of multi-pass GPU physics. The 7-kernel pipeline is a practical template for our physics system.

## The 7-kernel pipeline

1. **GenerateParticleValues** — Per rigid body: transform particles using quaternion rotations. Converts local particle positions to world space.

2. **ClearGrid** — Per grid cell: reset collision grid to -1 (empty). Must run before PopulateGrid every frame.

3. **PopulateGrid** — Per particle: assign to spatial grid cell via uniform hash. Lock-free insertion using atomic compare-exchange. Grid stores up to 4 particle refs per voxel (int4).

4. **CollisionDetection** — Per particle: check 27 neighboring cells. Pairwise sphere-sphere tests. Compute repulsive spring force + damping + tangential friction. Write forces to per-particle buffer.

5. **ComputeMomenta** — Per rigid body: aggregate particle forces into linear velocity + angular velocity. Sums forces and torques across all particles belonging to this body.

6. **ComputePositionAndRotation** — Per rigid body: Verlet-style integration. Update position from velocity, update quaternion from angular velocity.

7. **SavePreviousPositionAndRotation** — Per rigid body: cache current state for next frame's Verlet integration.

## Buffer layout

**Rigid body buffers** (indexed by body ID):
- positions, quaternions, velocities, angularVelocities

**Particle buffers** (indexed by particle ID):
- positions, velocities, forces, relativePositions

**Spatial grid**:
- `voxelCollisionGrid`: int4 per cell (4 particle slots)

## Spatial hashing implementation
```
gridLocation = (particlePosition - gridStartPosition) / particleDiameter
gridIndex = x + dimensions.x * y + (dimensions.x * dimensions.y * z)
```

Lock-free grid insertion: atomic compare-exchange on int4 components. If all 4 slots full, collision missed (acceptable tradeoff for simplicity).

## What we should adopt
- The multi-kernel pipeline pattern with explicit barriers between passes
- Spatial grid with atomic insertion (simpler than sort-based broadphase)
- The clear→populate→detect→resolve→integrate sequence
- Per-particle force accumulation → per-body momentum aggregation
- Verlet integration with previous-state caching

## What we should adapt
- int4 per cell limits to 4 particles — we may want a linked list or sorted approach for dense scenes
- Their particle/body distinction maps to our entity-component model: rigid body = entity, particles = collision shape samples

## What we should skip
- Unity-specific dispatch patterns (we use WebGPU command encoder)
- Their specific force model (spring + damping) — we'll want configurable force functions
