# Physics Engine Determinism Analysis

**Hard filter:** Any engine integrated into this project MUST guarantee cross-platform determinism -- identical inputs produce identical outputs on every platform, browser, and run. This is required for lockstep multiplayer.

---

## The Problem: IEEE 754 Float Non-Determinism

Floating-point arithmetic is not inherently cross-platform deterministic. Sources of divergence include:

- **FMA (fused multiply-add):** Some CPUs have FMA instructions that produce slightly different results than separate multiply+add.
- **Transcendental functions:** `sin()`, `cos()`, `tan()` have platform-specific implementations.
- **Compiler reordering:** Different compilers/optimization levels reorder float operations, changing results due to non-associativity.
- **SIMD variations:** Different SIMD instruction sets (SSE, AVX, NEON) produce subtly different results.
- **x87 vs SSE:** Legacy x87 uses 80-bit extended precision internally; SSE uses 32/64-bit.

WASM partially mitigates this: the WASM spec mandates IEEE 754 semantics, and all WASM engines execute the same instruction sequence. However, WASM still permits NaN bit pattern non-determinism, and engines may optimize differently.

---

## Engine-by-Engine Analysis

### 1. Rapier -- PASS (with deterministic build)

**Verdict: Recommended. Explicit cross-platform determinism guarantee via dedicated WASM packages.**

- **Deterministic builds available:** `@dimforge/rapier3d-deterministic` and `@dimforge/rapier2d-deterministic` on npm.
- **Guarantee:** Bit-level cross-platform determinism. Running the same simulation on different machines, browsers, operating systems, and processors produces the exact same byte-level results.
- **Verification method:** `world.createSnapshot()` produces a byte array; MD5 hash is identical across platforms after the same number of timesteps.
- **How it works:** The Rust codebase uses the `enhanced-determinism` feature flag, which:
  - Disables SIMD (`simd-stable`, `simd-nightly` features are mutually exclusive with determinism).
  - Disables parallel execution (`parallel` feature is mutually exclusive).
  - Enforces strict IEEE 754-2008 compliance across all 32-bit and 64-bit platforms, including WASM targets.
  - Does NOT use fixed-point math -- it achieves determinism by constraining float operations to a deterministic subset of IEEE 754.
- **Performance cost:** The deterministic build is slower than the standard build (SIMD and parallelism disabled). Exact overhead is not published but expected to be significant for large simulations.
- **Maturity:** Determinism is a first-class feature, documented and maintained. Dedicated npm packages signal long-term commitment.

**Key source:** [Rapier Determinism Docs](https://rapier.rs/docs/user_guides/javascript/determinism/)

### 2. Jolt Physics -- CONDITIONAL PASS

**Verdict: Viable but requires custom WASM build. Less turnkey than Rapier.**

- **Deterministic mode:** Enabled via `CROSS_PLATFORM_DETERMINISTIC` CMake flag. Approximately 8% performance overhead.
- **Platform support:** Tested with MSVC2022, Clang, GCC, and Emscripten. As of v5.1.0, the Emscripten/WASM build can be compiled cross-platform deterministic and delivers the same results as native Windows/Linux builds.
- **WASM SIMD:** Separate `USE_WASM_SIMD` CMake option available, but unclear if it is compatible with the determinism flag (likely mutually exclusive, as with Rapier).
- **Requirements for determinism:**
  - APIs that modify the simulation must be called in exactly the same order.
  - Must NOT use standard `sin`/`cos`/`tan` -- must use Jolt's own `Sin`/`Cos`/`Tan` functions.
  - Must use 64-bit builds (32-bit vs 64-bit determinism was only fixed recently).
- **JavaScript bindings:** Available via `jolt-physics` npm package (or `@isaac-mason/jolt-physics`), but the deterministic WASM build is not a pre-built npm package -- you would need to compile JoltPhysics.js yourself with the determinism flag.
- **Verification tooling:** Built-in `Check Determinism` mode in the Samples Application. `JPH_ENABLE_DETERMINISM_LOG` macro for debugging divergence.
- **Risk:** No pre-built deterministic npm package. Custom build pipeline adds maintenance burden. The API ordering requirement is a footgun.

**Key sources:**
- [Jolt Determinism Discussion](https://github.com/jrouwe/JoltPhysics/discussions/617)
- [Jolt v5.1.0 Release Notes](https://github.com/jrouwe/JoltPhysics/releases/tag/v5.1.0)

### 3. Box2D (v3.x) -- CONDITIONAL PASS (2D only, no rollback)

**Verdict: Cross-platform determinism confirmed in v3.1, but 2D only and lacks rollback determinism.**

- **Cross-platform determinism:** Supported as of Box2D v3.1. Multithreading is also deterministic (2 threads = 8 threads = same result).
- **Rollback determinism: NOT supported.** Erin Catto explicitly states Box2D does not have rollback determinism. Internal solver state and body orderings diverge after save/restore cycles. This means:
  - Pure lockstep (no prediction): Works.
  - Client-side prediction with rollback: Does NOT work. Client will perpetually desync and roll back.
- **Implications for our project:** If we use lockstep with no client prediction, Box2D works. If we need rollback netcode (which most modern multiplayer games use for latency hiding), Box2D is eliminated.
- **2D limitation:** Box2D is a 2D physics engine. If the project needs 3D physics, this is irrelevant.

**Key source:** [Box2D Determinism Blog Post (Aug 2024)](https://box2d.org/posts/2024/08/determinism/)

### 4. cannon-es -- FAIL

**Verdict: No determinism guarantees. Eliminated.**

- **No determinism documentation:** cannon-es makes no claims about cross-platform determinism anywhere in its docs or repository.
- **Pure JavaScript:** Written in JS from scratch (not compiled from C++). While this means it runs the same JS on all platforms, JavaScript float behavior is governed by the engine's JIT compiler, which can and does produce different results across V8/SpiderMonkey/JSC.
- **Unmaintained:** The original cannon.js is abandoned. cannon-es is a community fork with sporadic maintenance.
- **No WASM:** Runs as interpreted/JIT'd JavaScript, so it does not benefit from WASM's tighter float semantics.
- **Performance:** Significantly slower than Rapier or Jolt for any non-trivial simulation.

### 5. Ammo.js (Bullet) -- FAIL

**Verdict: No cross-platform determinism guarantee. Eliminated.**

- **Bullet does not guarantee cross-platform determinism.** The Bullet forum explicitly acknowledges that float behavior varies across compilers, OSes, and instruction sets.
- **Workaround exists but is impractical:** Replacing `btScalar` with a fixed-point type can theoretically achieve determinism, but this requires forking and modifying Bullet's source, recompiling via Emscripten, and maintaining the fork indefinitely.
- **Ammo.js is a direct Emscripten port of Bullet.** It inherits Bullet's non-determinism. The WASM compilation may help (WASM has tighter float semantics than native), but this is not tested or guaranteed by the Ammo.js maintainers.
- **Effectively unmaintained:** The main ammo.js repo has not seen significant updates. The Mozilla Reality fork is also stale.

---

## Summary Matrix

| Engine | Cross-Platform Determinism | Pre-built WASM | Rollback Safe | 3D | Maintained | Verdict |
|--------|---------------------------|----------------|---------------|-----|------------|---------|
| Rapier (deterministic build) | YES -- bit-level | YES (npm) | N/A (stateless snapshots) | YES | YES | **PASS** |
| Jolt Physics | YES (with CMake flag) | NO (custom build) | N/A | YES | YES | **CONDITIONAL** |
| Box2D v3.1 | YES | N/A | NO | 2D only | YES | **CONDITIONAL** |
| cannon-es | NO | NO (pure JS) | NO | YES | Barely | **FAIL** |
| Ammo.js (Bullet) | NO | YES but non-deterministic | NO | YES | NO | **FAIL** |

---

## Recommendation

**Rapier is the clear winner for our use case.** It is the only engine that provides:

1. An explicit, documented, first-class cross-platform determinism guarantee.
2. Pre-built deterministic WASM packages on npm (`@dimforge/rapier3d-deterministic`), requiring zero custom build infrastructure.
3. Bit-level verification via snapshot hashing.
4. Active maintenance with determinism as a core design goal.

**Jolt is the backup option** if Rapier proves insufficient (e.g., performance, feature gaps). It requires a custom Emscripten build with the determinism flag, which adds build complexity but is well-documented and tested.

**cannon-es and Ammo.js are eliminated.** Neither provides determinism guarantees and neither is actively maintained.

**Box2D is eliminated for our purposes** -- 2D only and no rollback determinism.

---

## Open Questions

1. **Rapier deterministic build performance:** What is the actual overhead vs the standard build for our expected entity counts? Needs benchmarking.
2. **Rapier snapshot/restore:** Can we use `createSnapshot()`/`restoreSnapshot()` for rollback netcode, or does Rapier have the same rollback divergence issue as Box2D?
3. **Jolt custom build feasibility:** If we need Jolt, how complex is the Emscripten build pipeline? Can it be automated in CI?
4. **NaN canonicalization in WASM:** Do any of these engines handle WASM NaN non-determinism explicitly, or is it a theoretical-only concern?
