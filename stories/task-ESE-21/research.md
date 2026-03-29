# Physics Engine Research for ECS Scene Engine

## Summary

Research into browser-compatible physics engines for integration with our Godot-inspired ECS scene engine. Evaluated 7 engines across correctness, performance, maintenance, bundle size, and ECS integration feasibility.

---

## Engine Comparison Matrix

| Engine | Dimension | Language | Runtime | License | Bundle Size (approx) | Active (2025-2026) |
|--------|-----------|----------|---------|---------|---------------------|-------------------|
| Rapier | 2D + 3D | Rust -> WASM | WASM | Apache-2.0 | ~1.5-2 MB (WASM) | Yes |
| cannon-es | 3D | TypeScript | JS | MIT | ~150 KB (minified) | Slow / Stalled |
| Ammo.js | 3D | C++ -> WASM | WASM/asm.js | Zlib | ~1.5-3 MB (WASM) | Minimal |
| Matter.js | 2D | JavaScript | JS | MIT | ~90 KB (minified) | Yes |
| box2d-wasm | 2D | C++ -> WASM | WASM | Zlib/MIT | ~300-400 KB (WASM) | Moderate |
| Jolt Physics | 3D | C++ -> WASM | WASM | MIT | ~1-2 MB (WASM) | Yes |
| WebGPU-native | N/A | N/A | N/A | N/A | N/A | None exist |

---

## Detailed Evaluations

### 1. Rapier (dimforge/rapier)

- **URL**: https://github.com/dimforge/rapier | https://rapier.rs
- **License**: Apache-2.0
- **Dimensions**: 2D and 3D (separate packages: `@dimforge/rapier2d-compat`, `@dimforge/rapier3d-compat`)
- **GPU-accelerated**: No. CPU-only (runs as WASM in browser).
- **WebGPU support**: No.
- **ECS integration**: Excellent. Rapier is designed as a standalone simulation library with no rendering opinions. Its API is structured around a `World` object with handles to bodies/colliders, which maps cleanly to ECS entity-component patterns. Used extensively with Bevy ECS in the Rust ecosystem (bevy_rapier).
- **Features**:
  - Collision detection: Yes -- broad-phase (sweep-and-prune), narrow-phase (GJK/EPA), continuous collision detection (CCD)
  - Rigid bodies: Yes -- dynamic, static, kinematic (position-based and velocity-based)
  - Constraints/joints: Yes -- revolute, prismatic, fixed, ball (spherical), rope, spring, generic 6-DOF
  - Additional: ray-casting, shape-casting, contact events, intersection events, collision groups/filters, character controllers
- **Bundle size**: ~1.5-2 MB for the WASM binary (rapier3d-compat). The `-compat` packages bundle WASM inline as base64 for easier loading.
- **Performance**: Deterministic simulation (cross-platform). Island-based sleeping. SIMD support in WASM builds. Benchmarks show competitive with Bullet/PhysX for typical game workloads. Handles thousands of rigid bodies at 60fps.
- **Maintenance**: Actively maintained by Dimforge. 5.2k+ GitHub stars, regular releases, active Discord community. Used in production by multiple game engines and frameworks (Bevy, react-three-rapier, PlayCanvas).

**Strengths**: Best-in-class API design for ECS integration. Deterministic. Both 2D and 3D from one vendor. Active maintenance. Strong TypeScript types.

**Weaknesses**: WASM binary size is non-trivial. No GPU acceleration. Rust source means contributing fixes requires Rust knowledge.

---

### 2. cannon-es (pmndrs/cannon-es)

- **URL**: https://github.com/pmndrs/cannon-es
- **License**: MIT
- **Dimensions**: 3D only
- **GPU-accelerated**: No. Pure JavaScript, CPU-only.
- **WebGPU support**: No.
- **ECS integration**: Good. Stateless-friendly API. The `World` + `Body` model maps to ECS, though less cleanly than Rapier. Used with react-three-fiber ecosystem (use-cannon).
- **Features**:
  - Collision detection: Yes -- broad-phase (NaiveBroadphase, SAPBroadphase), narrow-phase (GJK-based)
  - Rigid bodies: Yes -- dynamic, static, kinematic
  - Constraints/joints: Yes -- point-to-point, hinge, lock, distance, spring
  - Additional: ray-casting, trigger bodies, sleeping, material properties
- **Bundle size**: ~150 KB minified. Tree-shakeable ES modules.
- **Performance**: Reasonable for small-to-medium scenes (<500 bodies). Pure JS means no WASM overhead but also no SIMD. Sleeping bodies optimization. Struggles with large body counts compared to WASM engines.
- **Maintenance**: Last significant release was v0.20.0 in August 2022. The pmndrs organization has shifted focus to Rapier integration. Effectively in maintenance mode / stalled.

**Strengths**: Small bundle, pure JS (easy debugging), tree-shakeable, MIT license.

**Weaknesses**: Stalled development. Performance ceiling is lower than WASM alternatives. Missing features (no CCD, limited solver iterations). No 2D mode.

---

### 3. Ammo.js (kripken/ammo.js)

- **URL**: https://github.com/kripken/ammo.js
- **License**: Zlib (same as Bullet)
- **Dimensions**: 3D (Bullet is 3D-focused; has some 2D constraint modes but not a true 2D engine)
- **GPU-accelerated**: No. CPU via WASM/asm.js.
- **WebGPU support**: No.
- **ECS integration**: Poor-to-moderate. Ammo.js exposes a raw C++ object-oriented API via Emscripten bindings. The API is verbose, requires manual memory management (destroy() calls), and uses Bullet's class hierarchy. Not designed for data-oriented patterns.
- **Features**:
  - Collision detection: Yes -- full Bullet broadphase/narrowphase
  - Rigid bodies: Yes -- complete Bullet rigid body dynamics
  - Constraints/joints: Yes -- all Bullet constraint types (hinge, slider, cone-twist, point-to-point, 6-DOF, gear)
  - Additional: soft bodies (cloth, rope, volumetric), raycasting, vehicle dynamics, heightmap terrain, ghost objects
- **Bundle size**: ~1.5-3 MB depending on build configuration. Closure compiler can reduce. The WASM build is the full Bullet engine.
- **Performance**: Good raw performance (Bullet is battle-tested in AAA games). However, the JS bindings add overhead, and the API encourages patterns that are hostile to JS GC (frequent small object allocations for vectors/transforms).
- **Maintenance**: Last commit March 2023. Based on Bullet 2.82 (2013 vintage, with selective patches). Kripken (Emscripten author) is the maintainer but activity is minimal. No TypeScript types. Essentially legacy.

**Strengths**: Most feature-complete engine (soft bodies, vehicles). Bullet is the most battle-tested open-source physics engine in history.

**Weaknesses**: Terrible DX (manual memory management, no TS types, C++ API exposed raw). Stale. Large bundle. Based on old Bullet version. ECS-hostile API.

---

### 4. Matter.js (liabru/matter-js)

- **URL**: https://github.com/liabru/matter-js
- **License**: MIT
- **Dimensions**: 2D only
- **GPU-accelerated**: No. Pure JavaScript, CPU-only.
- **WebGPU support**: No.
- **ECS integration**: Moderate. Matter.js has its own internal engine/world model. Bodies are objects with position, angle, velocity properties that could be synced to/from ECS components. Plugin architecture allows some extensibility. Not designed for ECS but workable.
- **Features**:
  - Collision detection: Yes -- multi-phase (broad, mid, narrow). SAT-based narrow phase. Supports concave/convex hulls, compound bodies.
  - Rigid bodies: Yes -- dynamic, static. Mass, density, restitution, friction.
  - Constraints/joints: Yes -- distance constraints, point constraints, mouse constraints.
  - Additional: sleeping, gravity, raycasting, region queries, composite bodies, SVG/texture support
- **Bundle size**: ~90 KB minified. Pure JS, no WASM dependency.
- **Performance**: Good for casual 2D games. Handles hundreds of bodies. The constraint solver is position-based (Verlet), which is stable but not physically accurate for complex stacking. No SIMD.
- **Maintenance**: Active. Last commit June 2024. 18.1k GitHub stars, 13.1k npm dependents. Mature and stable. The most popular 2D physics library for the web.

**Strengths**: Smallest bundle. Most popular 2D web physics library. Stable API. Easy to get started. Good documentation.

**Weaknesses**: Not physically rigorous (position-based solver has known issues with stacking stability). No WASM acceleration. Limited constraint types compared to Box2D. 2D only.

---

### 5. box2d-wasm

- **URL**: https://github.com/nicksrandall/box2d-wasm (Note: multiple forks exist; the npm package `box2d-wasm` is the commonly used one)
- **License**: Zlib (Box2D) / MIT (WASM bindings)
- **Dimensions**: 2D only
- **GPU-accelerated**: No. CPU via WASM.
- **WebGPU support**: No.
- **ECS integration**: Moderate. Box2D uses a World + Body + Fixture model. The C++ API exposed via WASM is more verbose than a native JS API. Requires creating/destroying bodies through the world, which needs a sync layer to bridge ECS components.
- **Features**:
  - Collision detection: Yes -- Box2D's proven broad-phase (dynamic AABB tree) and narrow-phase (GJK/SAT)
  - Rigid bodies: Yes -- dynamic, static, kinematic
  - Constraints/joints: Yes -- revolute, prismatic, distance, pulley, gear, wheel, weld, friction, motor
  - Additional: raycasting, AABB queries, contact listeners, sensors (triggers), continuous collision detection
- **Bundle size**: ~300-400 KB (WASM binary). Smaller than 3D engines.
- **Performance**: Excellent for 2D. Box2D is the gold standard for 2D physics (used in Angry Birds, Limbo, many others). The iterative solver is well-tuned for stability. WASM execution gives near-native speed.
- **Maintenance**: Moderate. The WASM port is community-maintained. Box2D itself was rewritten as Box2D v3 (Erin Catto, 2024) with a new C API, but WASM ports of v3 are still emerging. The v2 WASM ports are stable but not actively developed.

**Note**: Box2D v3 (https://github.com/erincatto/box2c) was released in 2024 as a complete rewrite with a C API, SIMD support, and multi-threading. A WASM port would be the ideal 2D engine but is not yet mature for browser use.

**Strengths**: Box2D is the most proven 2D physics engine. Excellent solver stability. Rich joint types. CCD support.

**Weaknesses**: WASM bindings are verbose (C++ API). Multiple competing npm packages with varying quality. Box2D v2 API is dated. v3 WASM ports are immature.

---

### 6. Jolt Physics (jrouwe/JoltPhysics.js)

- **URL**: https://github.com/jrouwe/JoltPhysics.js | https://github.com/jrouwe/JoltPhysics
- **License**: MIT
- **Dimensions**: 3D (with 2D constraint modes possible)
- **GPU-accelerated**: No. CPU via WASM.
- **WebGPU support**: No.
- **ECS integration**: Good. Jolt has a clean C++ API that translates well through Emscripten. The BodyInterface pattern (create body -> add to physics system) maps to ECS sync patterns. Multiple build flavors available including single-threaded WASM.
- **Features**:
  - Collision detection: Yes -- broad-phase (sweep-and-prune), narrow-phase (GJK/EPA), CCD
  - Rigid bodies: Yes -- dynamic, static, kinematic. Motion quality settings (discrete vs linear cast).
  - Constraints/joints: Yes -- point, hinge, slider, cone-twist, 6-DOF, fixed, distance, pulley, gear, rack-and-pinion, path
  - Additional: character controller (virtual character), vehicle simulation, ragdolls, soft bodies (experimental), height fields, mesh shapes, compound shapes, sensors, contact listeners, shape casting, broadphase queries
- **Bundle size**: ~1-2 MB (WASM). Multiple flavors: wasm-compat (embedded), wasm (separate file), asm.js fallback, multi-threaded variants.
- **Performance**: Excellent. Jolt was developed at Guerrilla Games (Horizon series) and is now used in production at multiple AAA studios. Designed for large worlds with thousands of bodies. Layer-based broad-phase filtering. Island-based sleeping. SIMD in WASM.
- **Maintenance**: Very actively maintained. v1.0.0 released December 2025. The C++ engine is under active development by Jorrit Rouwe (former Guerrilla Games physics lead). Regular releases. Growing community adoption. MIT license.

**Strengths**: AAA pedigree (Guerrilla Games). Most feature-rich 3D engine evaluated. Excellent performance. Active maintenance. Clean API. Character controller included. MIT license.

**Weaknesses**: Relatively newer in the web/WASM space (the C++ engine is proven but the JS bindings are younger). WASM binary size. Requires manual memory management for some operations.

---

### 7. WebGPU-Native Physics Engines

**Status**: No production-ready WebGPU-native physics engine exists as of early 2026.

There are research projects and demos:
- GPU-based particle physics (compute shader N-body simulations, SPH fluid) -- these are specialized, not general-purpose rigid body engines
- The Unity GPU Physics demo (jknightdoeswork) mentioned in our reference notes is a 7-kernel compute pipeline, but it's Unity-specific and not a reusable library
- NVIDIA GPU Gems broadphase algorithms could be implemented in WGSL, but no one has shipped a complete rigid body solver on WebGPU compute

**Why not?** Rigid body physics involves sequential constraint solving (iterative solvers like PGS/TGS), contact graph analysis, and island detection -- algorithms that are inherently serial or require complex synchronization. While broadphase collision detection parallelizes well on GPU, the constraint solver does not. Modern CPU physics engines (Jolt, Rapier) use SIMD and multi-threading for the parts that parallelize, which is the pragmatic approach.

**Our approach**: Use a CPU-based physics engine for rigid body simulation. Keep our GPU compute pipeline for particle effects, spatial queries, and other embarrassingly-parallel workloads that benefit from GPU execution. See architecture.md for how these coexist.

---

## Recommendations

### Best 3D Engine: Rapier (`@dimforge/rapier3d-compat`)

**Why Rapier over Jolt?**

Both are excellent choices. Rapier wins on ECS integration for our specific architecture:

1. **ECS-native design**: Rapier was built alongside Bevy ECS. Its handle-based API (RigidBodyHandle, ColliderHandle) maps directly to entity IDs. Jolt uses an object-oriented BodyInterface that requires more bridging code.

2. **Deterministic simulation**: Rapier guarantees cross-platform determinism. Important if we add networking/replays.

3. **2D + 3D from one vendor**: We can use `rapier2d-compat` and `rapier3d-compat` with identical APIs, reducing the learning curve and integration surface.

4. **TypeScript types**: First-class, unlike Jolt's Emscripten-generated types.

5. **Proven in web ECS**: react-three-rapier, PlayCanvas, and other web engines already use Rapier in ECS-like patterns.

**Runner-up**: Jolt Physics is the better raw engine (more features, AAA pedigree). If we need character controllers, vehicles, or soft bodies, Jolt should be reconsidered. For our current needs (rigid bodies, collisions, joints), Rapier's cleaner integration wins.

### Best 2D Engine: Rapier (`@dimforge/rapier2d-compat`)

**Why Rapier over Matter.js / Box2D?**

1. **Same API as our 3D engine**: Using Rapier for both 2D and 3D means one integration layer, one set of components, one sync system. The PhysicsSystem works identically regardless of dimension.

2. **Better solver**: Rapier uses a Sequential Impulse solver that is more physically accurate than Matter.js's position-based Verlet integrator.

3. **WASM performance**: Significantly faster than Matter.js for equivalent body counts.

4. **Deterministic**: Like the 3D variant.

**When to consider alternatives**:
- **Matter.js**: If bundle size is critical and physics is casual/decorative (UI animations, simple games). Its 90 KB vs Rapier's ~1.5 MB is significant for lightweight applications.
- **Box2D v3 (future)**: When a mature WASM port of Box2D v3 ships, it could be the best 2D option (Erin Catto's rewrite is excellent). Worth monitoring.

### Summary

| Use Case | Recommended | Runner-up |
|----------|-------------|-----------|
| 3D rigid body physics | Rapier 3D | Jolt Physics |
| 2D rigid body physics | Rapier 2D | Matter.js (lightweight) |
| Particles / spatial queries | GPU compute (keep existing) | N/A |
| Soft bodies / vehicles | Jolt Physics | Ammo.js |

**Do not use**: cannon-es (stalled), Ammo.js (legacy DX), raw Box2D v2 WASM (dated API).
