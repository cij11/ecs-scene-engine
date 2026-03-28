# task-ESE-0020: GPU 3D Physics Optimization — Collaboration Plan

## Agents

### Agent A: Micro (Physics Validation)
**Goal:** Build isolated test cases that validate fundamental physics correctness.
**Works in:** `engine/gpu/systems/physics-validation.test.ts` and `stories/task-ese-0020/validation/`
**Stories:** One story per test case, building up:
1. Single particle falling under gravity (no collision)
2. Single particle bouncing off floor (bounds check)
3. Two particles colliding head-on (impulse response)
4. Particle hitting a wall at an angle (reflection)
5. Three particles in a line (chain collision)
6. 10 particles settling under gravity (pile behavior)

**Must not touch:** `engine/gpu/systems/physics.ts`, `stories/task-ese-0020/demo.stories.ts`

### Agent B: Macro (Data Structure Optimization)
**Goal:** Refactor physics data to packed vec4f buffers and separate impulse accumulation.
**Works in:** `engine/gpu/systems/physics-packed.ts` (NEW file), `stories/task-ese-0020/demo-packed.stories.ts` (NEW file)
**Changes:**
- Pack pos+radius into vec4f, vel+restitution into vec4f, force+mass into vec4f
- Separate impulse accumulation buffer (fixes race condition)
- 4-pass pipeline: clear → populate → collide(write impulses) → integrate(apply impulses)
- Updated demo story with packed data

**Must not touch:** `engine/gpu/systems/physics.ts` (leave original for comparison), validation stories

## Shared Resources
- `engine/gpu/systems/physics.ts` — READ ONLY (original, for reference)
- `engine/gpu/render/particle-renderer.ts` — both can read, neither modifies
- `stories/task-ese-0020/demo.stories.ts` — owned by Agent B for the packed demo

## Integration
Once Agent A validates the physics fundamentals and Agent B has the packed pipeline:
1. Agent A's test cases are re-run against Agent B's packed physics
2. If all pass, the packed version replaces the original
3. The demo story uses the packed version

## File Ownership
| File | Owner |
|------|-------|
| `engine/gpu/systems/physics-validation.test.ts` | Agent A |
| `stories/task-ese-0020/validation/*.stories.ts` | Agent A |
| `engine/gpu/systems/physics-packed.ts` | Agent B |
| `stories/task-ese-0020/demo-packed.stories.ts` | Agent B |
| `stories/task-ese-0020/demo.stories.ts` | Agent B |
| `engine/gpu/systems/physics.ts` | READ ONLY (neither) |
