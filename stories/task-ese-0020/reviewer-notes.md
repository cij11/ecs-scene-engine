# Physics Review — Agent C (Physics Reviewer)

Review of Agent A (validation stories) and Agent B (packed data pipeline) output for task-ESE-0020, informed by reference research into Godot's physics engine and GPU Physics Unity.

## Files Reviewed

- `engine/gpu/systems/physics-packed.ts` (Agent B)
- `engine/gpu/systems/physics.ts` (original, for comparison)
- `stories/task-ese-0020/validation/physics-validation.stories.ts` (Agent A, locked — may change)

## Reference Research Completed

- Godot `godot_physics_3d` module: step, body pair, body, broadphase
- GPU Physics Unity: compute shader pipeline
- See `references/godot/insights/gpu-collision-insights.md`
- See `references/gpu-physics-unity/insights/collision-pipeline.md`

---

## Review of Agent B: Packed Pipeline (`physics-packed.ts`)

### What is correct

1. **4-pass pipeline architecture is sound.** Clear -> Populate -> Collide -> Integrate matches both GPU Physics Unity and GPU Gems Ch. 32. The separation of concerns is clean.

2. **Impulse buffer separation fixes the race condition.** The original `physics.ts` writes directly to `vx/vy/vz` during collision, which is a GPU race condition (two threads can modify the same body's velocity). The packed version writes to `impulse[]` and applies in the integrate pass. This is the correct fix and matches the Unity GPU Physics pattern (they use a force buffer).

3. **vec4f packing is a valid optimization.** Packing `pos+radius` and `vel+restitution` into vec4f reduces buffer count and improves memory coalescing on GPU. The w-component usage (radius, restitution) is clean.

4. **Spatial hash grid with 4 slots per cell is standard.** Confirmed by both GPU Physics Unity (`int4` per cell) and GPU Gems. This is correct for our scale.

5. **Atomic compare-exchange for grid population is correct.**

### Issues Found

#### ISSUE 1 (Medium): Impulse buffer is not cleared before collision pass

The collision pass ACCUMULATES into the impulse buffer:
```wgsl
impulse[eid] = vec4f(
    impulse[eid].x + accImpulse.x,
    ...
);
```

But the impulse buffer is only cleared in the INTEGRATE pass (after it is consumed). This means the clear and the accumulation are in different passes, which is correct in the 4-pass model. However, if the integrate pass runs before the collision pass on the first frame, stale data could be read. **The impulse buffer should be initialized to zero on creation.** Verify this happens in the host-side setup code.

#### ISSUE 2 (Medium): Restitution uses current-frame velocity, not previous-frame

The collision shader computes:
```wgsl
let relVel = dot(vA - vB, normal);
let j = -(1.0 + rest) * relVel * 0.5;
```

Godot explicitly uses **previous frame** velocities for the restitution term (`get_prev_linear_velocity()`). Using current-frame velocities means that if forces have already been integrated before collision (which they have NOT in the packed pipeline — forces are integrated in pass 4), the bounce may be slightly off. In our current pipeline ordering (collision before integration), this is actually acceptable because velocities haven't been modified yet this frame. **No change needed now**, but document this assumption.

#### ISSUE 3 (Low): Separation push is mixed into impulse buffer

The collision pass adds both velocity impulse AND position separation push to the same impulse buffer:
```wgsl
// Velocity impulse
accImpulse = accImpulse + normal * j;
// Position push
accImpulse = accImpulse + normal * overlap * 0.5;
```

The integrate pass then applies both as velocity changes:
```wgsl
vx = vx + imp.x;
```

This means the overlap separation is treated as an instantaneous velocity kick rather than a position correction. For small overlaps this works, but for large overlaps it adds excessive energy. Godot handles this with a separate bias impulse channel.

**Recommendation:** For now this is acceptable. If particles explode on deep penetration, separate the position correction into its own channel (or apply overlap directly to position, not velocity).

#### ISSUE 4 (Low): Equal mass assumption limits future use

The impulse formula `j = -(1.0 + rest) * relVel * 0.5` assumes equal mass. The general formula is:
```
j = -(1.0 + rest) * relVel / (1/massA + 1/massB)
```

The `force.w` is reserved for mass but unused. This is fine for now — the comment documents the assumption.

#### ISSUE 5 (Low): Hardcoded damping values

Both velocity damping (0.998) and bounce dampening (0.5) are hardcoded. These should eventually be uniforms, but for initial development this is fine.

### Verdict: Agent B's work is solid

The packed pipeline is architecturally correct. The impulse buffer separation is the most important change and it is implemented correctly. The issues found are all Low-Medium severity and none are blocking.

---

## Review of Agent A: Validation Stories

### What is correct

1. **Test methodology is excellent.** Running ACTUAL GPU compute shaders (not CPU reference implementations) and reading back positions via staging buffers validates the real code path. This is exactly what we need.

2. **Canvas2D trajectory rendering provides good visual debugging.** The side-view with start/end markers and per-frame dots makes physics behavior immediately visible.

3. **Validation checks are well-designed.** Each story has specific, measurable pass/fail criteria that test the right things:
   - GravityDrop: monotonic y decrease, floor arrival, no lateral drift
   - FloorBounce: floor contact, bounce detection, energy loss, settling
   - HeadOnCollision: approach, separation, velocity reversal
   - WallReflection: wall contact, direction reversal, bounds compliance
   - SettlingPile: convergence, spread, bounds, settling velocity

4. **The stories test the ORIGINAL `physics.ts`, not the packed version.** This is correct per the collaboration plan — Agent A validates fundamentals first, then the tests get re-run against the packed version during integration.

### Issues Found

#### ISSUE 1 (Info): Validation stories test original physics.ts which has the race condition

The stories import from `physics.js` (the original, race-prone version). The collision results for multi-particle stories (HeadOnCollision, SettlingPile) may not be deterministic due to the race condition. This is expected — the validation stories establish baseline expectations, and the race condition bugs should disappear when re-tested against the packed version.

#### ISSUE 2 (Info): Missing chain collision test (story 5 from the plan)

The collaboration plan listed 6 test cases, but only 5 stories are implemented:
1. GravityDrop
2. FloorBounce
3. HeadOnCollision
4. WallReflection
5. SettlingPile

Missing: "Three particles in a line (chain collision)". This is the most demanding validation of impulse propagation and would be very useful for testing the packed version. Agent A may still be working on it (file is locked).

### Verdict: Agent A's work is strong

The validation framework is thorough and correctly designed. The missing chain collision test should be added before integration testing.

---

## Key Questions Answered

### Should we use impulse accumulation (separate buffer) or direct velocity modification?

**Use impulse accumulation (separate buffer).** This is what Agent B implements and it is correct.

Godot uses direct velocity modification but in a SEQUENTIAL solver where order is deterministic. On GPU, all threads execute in parallel, so direct velocity modification creates race conditions. Both GPU Physics Unity (force buffer) and Agent B (impulse buffer) use the separation pattern. This is the standard GPU approach.

### What does Godot do for collision response?

Godot uses a Sequential Impulse solver with:
- Accumulated impulses (warmstarted across frames)
- Separate bias impulse for position correction (Baumgarte stabilization)
- Multiple solver iterations per frame
- Coulomb friction clamped to normal impulse

For our GPU pipeline, a single-pass impulse (no iterations, no warmstarting) is the pragmatic starting point. If stacking stability becomes a problem, the first upgrade should be multiple collision-integrate iterations per frame (easy to implement as repeated dispatch).

### Is vec4f packing standard practice or over-optimization?

**Standard practice.** GPU memory is accessed in 128-bit (vec4f) aligned loads. Packing `pos+radius` into a single vec4f means one memory transaction instead of two (pos vec3 + radius float). Both structured buffer reads and writes are more efficient at vec4f alignment. This is not premature optimization — it is how GPU code should be written.

### Is the 4-slot-per-cell grid adequate?

**Yes.** Both GPU Physics Unity and GPU Gems use 4 slots per cell. With cell size equal to particle diameter, the expected occupancy is 1-2 particles per cell in typical scenes. 4 slots handles local clustering. If overflow occurs (dense stacking), particles silently miss collisions rather than crashing — this is acceptable degradation.

For very dense scenes (100+ particles stacked), the cell size should be tuned to match the largest particle diameter, and overflow logging should be added. But 4 slots is correct for now.

### What is the minimum correct collision response?

For sphere-sphere with equal mass:
1. Compute collision normal (normalize difference vector)
2. Compute relative velocity along normal
3. If approaching (relVel < 0): compute impulse `j = -(1+e) * relVel * 0.5`
4. Apply impulse to velocity (via buffer, not direct)
5. Separate overlapping particles (push apart along normal)

This is what Agent B implements. It is the minimum correct response. No friction, no angular velocity, no unequal mass needed yet.

---

## Summary Recommendations

### For Agent B (packed pipeline)
1. Verify impulse buffer is zero-initialized on creation (host code)
2. Document the assumption that collision runs before force integration
3. Consider separating position correction from velocity impulse if deep-penetration explosions occur
4. No blocking issues found

### For Agent A (validation)
1. Add the chain collision test (3 particles in a line) before integration testing
2. No blocking issues found

### For integration
1. Re-run all Agent A validation stories against Agent B's packed pipeline
2. Add a "packed vs original" comparison story that runs both and displays side-by-side
3. If stacking is unstable, the cheapest fix is to run the collide+integrate pair 2-4 times per frame (sub-stepping)
