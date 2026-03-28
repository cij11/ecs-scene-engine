# Godot 3D Physics — GPU Collision Insights

Study of `modules/godot_physics_3d/` focusing on collision response, impulse accumulation, broadphase, and integration strategy. Evaluated for relevance to our GPU compute physics pipeline.

## 1. Overall Architecture

Godot's physics step (`godot_step_3d.cpp`) follows a strict ordering:

1. **Integrate forces** — apply gravity, damping, external forces to compute new velocities
2. **Update broadphase** — BVH tree detects collision pairs
3. **Generate constraint islands** — group connected bodies for isolated solving
4. **Setup constraints** — compute contact normals, depths, mass properties (threaded)
5. **Pre-solve islands** — compute bias, warmstart from previous frame's accumulated impulses
6. **Solve islands** — iterative constraint solving with accumulated impulses (threaded)
7. **Integrate velocities** — apply solved velocities to update positions

Key insight: forces are integrated BEFORE collision detection, and positions are integrated AFTER constraint solving. This is a semi-implicit Euler approach.

## 2. Collision Response — Sequential Impulse Solver

Godot uses a **Sequential Impulse** (SI) solver, which is the industry standard for real-time physics (also used by Bullet, Box2D, PhysX). Key characteristics:

### Accumulated Impulses (Warmstarting)

The `Contact` struct stores accumulated impulse values that persist across frames:
- `acc_normal_impulse` — total accumulated normal impulse (scalar, clamped >= 0)
- `acc_tangent_impulse` — accumulated friction impulse (vec3)
- `acc_bias_impulse` — position correction impulse
- `acc_bias_impulse_center_of_mass` — secondary position correction at center of mass

At the start of each frame, the previous frame's accumulated impulses are applied as a **warmstart** (`pre_solve`). This is critical for stable stacking — without warmstarting, piles of objects oscillate or explode.

### Solve Loop

The `solve()` function runs multiple iterations per island per frame:
```
for each iteration:
  for each contact in island:
    compute relative velocity at contact point
    compute impulse to resolve velocity constraint
    CLAMP accumulated impulse >= 0  (key: clamping happens on accumulated, not delta)
    apply delta impulse to both bodies
```

The clamping on the accumulated impulse (not the per-iteration delta) is what makes SI stable. This is the Erin Catto (Box2D) formulation.

### Bounce (Restitution)

Bounce is computed from the **previous frame's velocities** (before solving), not the current velocities. This prevents the solver from double-counting restitution across iterations. Bounce formula:
```
bounce = combined_restitution * dot(prev_relative_velocity, normal)
```

Combined restitution: `clamp(A.bounce + B.bounce, 0, 1)` (additive, not multiplicative).

### Friction

Coulomb friction model: tangential impulse is clamped to `normal_impulse * friction_coefficient`. The friction coefficient is `min(A.friction, B.friction)`.

## 3. Broadphase — BVH (not spatial hash)

Godot uses a **Bounding Volume Hierarchy** (BVH) for broadphase, NOT a spatial hash grid. The BVH:
- Has two trees: static and dynamic
- Maintains pair callbacks for enter/exit
- Performs incremental updates (move operations)

### Relevance to our GPU implementation

BVH is CPU-friendly (pointer-chasing, tree traversal) but not GPU-friendly. For GPU compute, **spatial hashing is the correct choice** — it maps naturally to flat arrays and has O(1) lookups. Our current approach (uniform grid with 27-cell neighbor check) matches GPU Gems Ch. 32 and the Unity GPU Physics reference implementation.

## 4. Position Correction

Godot uses **Baumgarte stabilization** (bias) for position correction:
```
bias = -baumgarte_factor * inv_dt * min(0, -depth + slop)
```

The bias is applied as a separate "bias impulse" channel that only affects position, not velocity. This is applied at the center of mass as a fallback if the rotational correction doesn't fully resolve penetration.

This is more sophisticated than our current approach (direct position push in the collision pass).

## 5. Key Differences from Our GPU Implementation

| Aspect | Godot | Our GPU Pipeline |
|--------|-------|-----------------|
| Solver | Sequential Impulse (iterative) | Single-pass impulse |
| Impulse accumulation | Across frames (warmstarting) | Per-frame only |
| Broadphase | BVH (CPU) | Spatial hash grid (GPU) |
| Position correction | Baumgarte bias impulse | Direct overlap push |
| Restitution source | Previous frame velocity | Current frame velocity |
| Friction | Coulomb model | None |
| Mass handling | Full inverse mass + inertia tensor | Equal mass assumption |
| Threading | Island-parallel | Per-particle parallel |

## 6. Recommendations for Our Pipeline

### Must-have (correctness)
- **Separate impulse buffer** (Agent B already does this) — eliminates race condition
- **Use previous-frame velocity for restitution** — prevents energy gain during solving
- **Clamp accumulated impulse >= 0** — prevents attractive forces

### Nice-to-have (stability)
- **Multiple solver iterations** — even 2-4 iterations dramatically improves stacking
- **Baumgarte position correction** — cleaner than direct position push
- **Warmstarting** — requires persistent contact storage, complex for GPU but transformative for pile stability

### Not needed for our scale
- Full inertia tensor (we only have spheres for now)
- Friction (can add later, spheres work ok without)
- Island solving (our particles are all in one "island")
- BVH broadphase (spatial hash is better for GPU)
