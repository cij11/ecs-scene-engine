# Rapier Solver Analysis for GPU Compute Shader Port

Source: `dimforge/rapier` master branch, `src/dynamics/solver/` directory.
Scope: sphere-sphere, equal mass, no friction, no joints.

---

## 1. Exact Impulse Formula for Sphere-Sphere (Equal Mass)

From `contact_constraint_element.rs`, the normal contact constraint solve:

```
dvel = dot(n, v1) - dot(n, v2) + rhs
new_impulse = cfm_factor * max(0, old_impulse - r * dvel)
dlambda = new_impulse - old_impulse

v1 += n * im * dlambda
v2 -= n * im * dlambda
```

Where:
- `n` = contact normal (from body 2 to body 1, negated manifold normal)
- `v1`, `v2` = linear velocities of body 1 and body 2
- `im` = inverse mass (scalar for spheres, stored as a vector for per-axis mass)
- `r` = projected mass = `1 / (im1 + im2)` (the effective mass along the normal)
- `rhs` = bias term (penetration correction + restitution, see section 2)
- `cfm_factor` = constraint force mixing softness factor (see section 2)

For **equal-mass spheres** where `im1 = im2 = 1/m`:

```
r = 1 / (1/m + 1/m) = m / 2
```

Note: for spheres (as opposed to boxes), there is no angular torque contribution to the effective mass because the contact normal passes through the center of mass. The `torque_dir.gcross(dp)` terms are zero when the contact point lies on the line connecting the two centers, which is always true for sphere-sphere. So for sphere-sphere:

```
projected_mass = 1 / (im1 + im2)  // no angular terms
```

The full impulse update per solver iteration:

```
relative_vel_along_normal = dot(n, v1 - v2)
dvel = relative_vel_along_normal + rhs
new_impulse = cfm_factor * max(0, accumulated_impulse - projected_mass * dvel)
dlambda = new_impulse - accumulated_impulse
accumulated_impulse = new_impulse

delta_v = dlambda / m   // dlambda * inverse_mass
v1 += n * delta_v
v2 -= n * delta_v
```

The `max(0, ...)` clamp is critical -- it enforces the unilateral contact constraint (bodies can only push, never pull). This is a Projected Gauss-Seidel (PGS) solver.

### Restitution

Restitution is folded into the rhs as a velocity target:

```
rhs_wo_bias = is_bouncy * restitution * initial_projected_velocity
```

Where `initial_projected_velocity = dot(n, v1 - v2)` computed at constraint setup (not during iteration). The `is_bouncy` flag is set based on whether the approach velocity exceeds a threshold.

---

## 2. How Rapier Separates Velocity Impulse from Position Correction

Rapier uses **bias velocity with CFM softness** -- not split impulse, not direct position projection.

From `velocity_solver.rs`, the solve loop per substep:

```rust
// Phase 1: Solve WITH bias (penetration correction + velocity)
contact_constraints.update(params, substep_id, ...);  // recomputes rhs with bias
warmstart();
for _ in 0..num_internal_pgs_iterations {  // default: 1
    joint_constraints.solve();
    contact_constraints.solve();
}

// Phase 2: Integrate positions
integrate_positions();  // pos += vel * dt

// Phase 3: Solve WITHOUT bias (stabilization)
for _ in 0..num_internal_stabilization_iterations {  // default: 1
    contact_constraints.solve_wo_bias();
}
```

### The bias term (from `ContactWithCoulombFrictionBuilder::update`):

```
allowed_lin_err = 0.001 * length_unit    // penetration tolerance
erp_inv_dt = angular_freq / (dt * angular_freq + 2 * damping_ratio)
max_corrective_velocity = 10.0 * length_unit

rhs_wo_bias = restitution_velocity + max(0, dist) * inv_dt
rhs_bias = clamp((dist + allowed_lin_err) * erp_inv_dt, -max_corrective_velocity, 0)
rhs = rhs_wo_bias + rhs_bias
```

Where:
- `dist` = signed penetration distance (negative = penetrating)
- `erp_inv_dt` is the Error Reduction Parameter divided by dt
- Default spring: `natural_frequency = 30.0 Hz`, `damping_ratio = 5.0`

### The CFM factor:

CFM (Constraint Force Mixing) softens the constraint to prevent over-correction:

```
angular_freq = natural_frequency * 2 * PI    // 30 * 2pi ~ 188.5
erp = dt * angular_freq / (dt * angular_freq + 2 * damping_ratio)
cfm_coeff = (1/erp - 1)^2 / ((1 + 1/erp - 1) * 4 * damping_ratio^2)
cfm_factor = 1 / (1 + cfm_coeff)
```

The cfm_factor is applied multiplicatively to the entire impulse:
```
new_impulse = cfm_factor * max(0, old_impulse - r * dvel)
```

This is the key softness mechanism. It means the constraint doesn't fully resolve in one iteration -- it converges over multiple substeps/iterations.

### The two-phase solve

The critical insight: after solving with bias and integrating positions, Rapier does a **second solve pass without bias** (`solve_wo_bias`). This is the "stabilization" pass. In this pass, `rhs` is replaced with `rhs_wo_bias` (no penetration correction term) and `cfm_factor` is set to 1.0.

This two-phase approach prevents the bias velocity from "leaking" into the final velocity. Without it, objects would have artificial velocity from penetration correction that makes them bounce when they shouldn't.

---

## 3. What Makes Rapier's Settling Work That a Naive GPU Port Misses

The specific things that make 5000 balls settle into a flat layer:

### 3a. Accumulated impulse clamping (warmstarting across substeps)

The impulse is **accumulated** across solver iterations and substeps, not computed fresh each time. The clamp `max(0, accumulated - r * dvel)` operates on the running total. This is fundamentally different from computing an impulse from scratch each frame.

Between substeps:
```
impulse_accumulator += impulse;    // save total
impulse *= warmstart_coefficient;  // scale down (default: 1.0, so full warmstart)
```

This means the solver "remembers" the force it needed last substep and starts from there. For a pile of balls at rest, the accumulated impulse converges to exactly the force needed to support the weight above. A naive implementation that computes impulse from scratch each frame will oscillate and never settle.

### 3b. Sub-stepping with position integration between solves

Rapier's `num_solver_iterations` (default: 4) is implemented as **sub-steps**, not just extra PGS iterations. Each substep:
1. Adds gravity increment (`solver_vel += gravity * sub_dt`)
2. Updates constraint bias from **current penetration depth** (recomputed from integrated positions)
3. Runs PGS iterations
4. Integrates positions (`pos += vel * sub_dt`)
5. Runs stabilization solve

This is crucial. The constraints are re-linearized at the new positions between substeps. A naive GPU port that runs 4 PGS iterations on stale position data will not converge nearly as well.

### 3c. Sequential constraint solving (Gauss-Seidel, not Jacobi)

In PGS, each constraint solve immediately updates the velocity, and subsequent constraints see the updated velocity. This is **Gauss-Seidel** ordering. It converges much faster than **Jacobi** (where all constraints read the same initial velocity and write to separate buffers).

For settling, this matters enormously. When ball A pushes ball B up, and ball B is in contact with ball C, the Gauss-Seidel ordering means ball C immediately "sees" ball B's new velocity within the same iteration. With Jacobi, that information takes one full iteration to propagate, meaning you need many more iterations to propagate forces through a stack.

### 3d. Soft constraints (CFM + spring model)

The CFM factor (typically ~0.8-0.95 depending on dt) prevents over-shooting. Without it, the solver can apply too much corrective impulse and create oscillation. The spring-damper model (natural_frequency=30Hz, damping_ratio=5.0) is tuned to be critically/over-damped for typical scenarios.

### 3e. The stabilization pass removes velocity artifacts

Without the `solve_wo_bias` stabilization pass after integration, the penetration-correction velocity stays in the system and causes jitter. The stabilization pass "cleans up" by re-solving constraints with only the physics-based rhs (restitution), removing any leftover bias velocity.

---

## 4. Can the Algorithm Be Parallelized?

### Inherently sequential parts:

1. **PGS iteration order within a substep.** Each constraint solve reads and writes shared body velocities. Constraint A's result affects constraint B's solve. This is the Gauss-Seidel property and is inherently sequential for constraints sharing a body.

2. **The substep loop.** Each substep depends on positions integrated from the previous substep. The bias terms are recomputed from new positions. Substeps cannot be parallelized.

3. **Warmstart accumulation.** The impulse accumulator carries state across substeps.

### Parallelizable parts:

1. **Constraints on disjoint bodies** can be solved in parallel. Rapier's `InteractionGroups` system does exactly this -- it groups constraints that don't share bodies and solves each group in parallel (SIMD batching). Constraints within a group are independent.

2. **Position integration** is embarrassingly parallel (each body independent).

3. **Constraint setup/update** (computing rhs, projected mass) is per-constraint and parallel.

### Can sub-stepping replace sequential PGS iteration?

**Partially, but not fully.** Sub-stepping gives you position re-linearization between solves (good) but doesn't give you Gauss-Seidel propagation within a solve pass. You can use more substeps with fewer PGS iterations per substep to shift toward parallelism.

Rapier's default is 4 substeps with 1 PGS iteration each. This already uses the "more substeps, fewer iterations" strategy. The key insight is that position re-linearization from sub-stepping is more valuable than extra PGS iterations at stale positions.

For GPU: you could do **Jacobi iteration per substep** (fully parallel) if you have enough substeps. The convergence will be slower per-iteration than Gauss-Seidel, but each iteration is fully parallel. You need roughly 2-4x more Jacobi iterations to match GS convergence, but on GPU the wall-clock time may be similar or faster.

---

## 5. Minimum Changes for GPU Settling Behavior

Given your current setup: spatial hash grid, parallel collision detection, impulse accumulation buffer, separate position separation buffer, 4 sub-steps per frame.

### What's likely wrong:

**Problem 1: You're probably using Jacobi-style impulse accumulation without clamping on the accumulated total.**

The naive GPU approach: compute impulse for each collision pair, atomicAdd to a shared buffer, then apply. This is Jacobi. Worse, if you compute impulse = projected_mass * relative_velocity for each pair independently, you lose the accumulated impulse clamping.

Fix: Each contact pair must maintain an `accumulated_impulse` value across substeps. The clamp `max(0, ...)` must operate on this accumulated value, not on the per-frame impulse. This means you need persistent contact state (a contact cache / pair buffer).

**Problem 2: Position separation is probably applied as a direct displacement, not as a bias velocity.**

If you have a "position separation buffer" that directly moves balls apart, you're doing direct position correction. This creates energy (balls will bounce off each other after being separated). Rapier converts penetration into a bias velocity term in the impulse solve, then removes the bias after integration.

Fix: Remove the separate position separation pass. Instead, add a bias term to your velocity impulse:
```
bias = clamp((penetration - allowed_error) * erp_inv_dt, -max_corrective_vel, 0)
```
Then after solving with bias and integrating, solve once more without bias.

**Problem 3: You're probably not re-detecting/re-linearizing contacts between substeps.**

If you detect collisions once, then run 4 substeps on those stale contacts, the penetration depths are stale after the first integration. Rapier recomputes penetration depth each substep from integrated positions.

Fix: You don't need to re-run the spatial hash each substep (expensive). Instead, keep the contact pair list from detection, but recompute `dist` from the current positions each substep:
```
dist = length(pos1 - pos2) - (radius1 + radius2)
normal = normalize(pos1 - pos2)
```

**Problem 4: No warmstarting / impulse persistence.**

Without warmstarting, the solver starts from zero each frame. For a resting pile, it has to "rediscover" the support forces every frame (4 substeps of 1 Jacobi iteration = very little convergence). With warmstarting, it starts from last frame's solution and only needs to adjust.

Fix: Maintain a contact cache that maps pair IDs to accumulated impulses. At the start of each frame, look up the previous impulse for each contact pair and use it as the initial `accumulated_impulse`.

### The simplest correct GPU solver:

```
// Per frame:
detect_collisions()  // spatial hash, output: contact pair list with (idA, idB, normal, dist)
load_warmstart_impulses()  // from previous frame's contact cache

for substep in 0..4:
    // Recompute penetration from current positions (parallel, per pair)
    update_contact_distances()

    // Compute bias terms (parallel, per pair)
    compute_rhs()  // includes penetration bias + restitution

    // Apply gravity (parallel, per body)
    apply_gravity_increment()

    // Solve with bias -- this is the hard part on GPU
    // Option A: Jacobi iteration (fully parallel, needs 2-4 iterations)
    // Option B: Graph-colored Gauss-Seidel (parallel within color, sequential across colors)
    for iter in 0..num_iterations:
        solve_contacts_jacobi()  // or solve_contacts_colored_gs()

    // Integrate positions (parallel, per body)
    integrate_positions()

    // Stabilization solve without bias
    remove_bias_from_rhs()
    for iter in 0..1:
        solve_contacts_jacobi()

save_warmstart_impulses()  // to contact cache for next frame
```

For the Jacobi solve kernel (per contact pair):
```wgsl
let n = contact.normal;
let v1 = velocities[contact.bodyA].linear;
let v2 = velocities[contact.bodyB].linear;
let dvel = dot(n, v1 - v2) + contact.rhs;
let new_impulse = cfm_factor * max(0.0, contact.accumulated_impulse - projected_mass * dvel);
let dlambda = new_impulse - contact.accumulated_impulse;
contact.accumulated_impulse = new_impulse;

// Jacobi: write to delta buffer, apply after all pairs solved
atomicAdd(&velocity_deltas[contact.bodyA], n * dlambda * inv_mass);
atomicAdd(&velocity_deltas[contact.bodyB], -n * dlambda * inv_mass);
```

### Summary of priorities (ordered by impact on settling):

1. **Accumulated impulse with clamping on the total** -- without this, nothing settles
2. **Bias velocity for penetration correction** (not direct position separation) -- without this, energy leaks in
3. **Contact distance recomputation each substep** -- without this, sub-stepping is pointless
4. **Stabilization pass (solve without bias after integration)** -- without this, bias velocity causes jitter
5. **Warmstarting from previous frame** -- without this, convergence is too slow for resting piles
6. **CFM softness factor** -- without this, over-correction causes oscillation
7. **Graph-coloring for GS on GPU** (optional) -- improves convergence per iteration but Jacobi with enough substeps works

---

## Appendix: Rapier's Default Constants

From `IntegrationParameters::default()`:
- `dt = 1/60`
- `num_solver_iterations = 4` (these are substeps, not just PGS iterations)
- `num_internal_pgs_iterations = 1` (PGS iterations within each substep)
- `num_internal_stabilization_iterations = 1`
- `warmstart_coefficient = 1.0`
- `normalized_allowed_linear_error = 0.001` (meters)
- `normalized_max_corrective_velocity = 10.0` (meters/sec)
- Contact spring: `natural_frequency = 30.0 Hz`, `damping_ratio = 5.0`

The substep dt is: `params.dt = base_dt / num_solver_iterations = (1/60) / 4 = 1/240`

For the default spring at dt=1/240:
- `angular_freq = 30 * 2 * PI = 188.496`
- `erp_inv_dt = 188.496 / (188.496/240 + 10.0) = 188.496 / 10.785 = 17.48`
- `erp = (1/240) * 17.48 = 0.0728`
- `cfm_coeff = (1/0.0728 - 1)^2 / ((1/0.0728) * 4 * 25) = (12.73)^2 / (13.73 * 100) = 162.0 / 1373 = 0.118`
- `cfm_factor = 1 / (1 + 0.118) = 0.894`
