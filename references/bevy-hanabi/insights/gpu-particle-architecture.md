# bevy_hanabi — Insights for GPU Particle Architecture

## What it is
GPU particle system for Bevy. Millions of particles in real time. Spawning, simulation, and rendering all on GPU via compute + graphics shaders.

## Why it matters for us
This is the gold standard for GPU particle systems in an ECS engine. The architecture decisions here are battle-tested. Our particle PoC should follow this model.

## Key architectural decisions

### 1. Four-shader pipeline
1. **vfx_indirect.wgsl** — Compute workgroup counts from particle counts (GPU self-dispatch)
2. **vfx_init.wgsl** — Initialize newly spawned particles
3. **vfx_update.wgsl** — Per-frame simulation (physics, aging, forces)
4. **vfx_render.wgsl** — Vertex/fragment for rendering

Critical insight: GPU calculates its OWN workgroup counts. No CPU stall waiting to know how many particles to dispatch.

### 2. Zero CPU-GPU synchronization
- Particle state lives entirely on GPU (ParticleBuffer)
- CPU never reads back particle positions/velocities
- MetadataBuffer tracks counts on GPU side
- DrawIndirectBuffer enables GPU-driven draw calls
- Only CPU→GPU data: spawner parameters, effect properties

### 3. Modifier system → code fragment stitching
Modifiers are composable behaviors:
- **Init modifiers**: set initial position, velocity, lifetime
- **Update modifiers**: apply forces, decay attributes
- **Render modifiers**: color gradients, size scaling

Each modifier contributes a WGSL code fragment. Fragments are stitched into per-effect specialized shaders. Cached in ShaderCache.

### 4. Slab allocator for particle memory
EffectCache + ParticleSlab manages GPU memory. Effects allocated once and persist. No per-frame allocation.

### 5. Expression graph
Modifiers use an expression graph (not just constants). Expressions compile to WGSL inline code. This enables data-driven particle behaviors without shader recompilation.

### 6. ECS integration via extract pattern
- Main world: ParticleEffect component (asset reference), EffectProperties (runtime tweaks)
- Extract stage: copies to render world
- Render world: CompiledParticleEffect (cached GPU data)
- Change detection: modifications to ParticleEffect trigger recompilation

## What we should adopt
- The 4-pass pipeline structure (indirect → init → update → render)
- GPU-driven indirect dispatch — essential for variable entity counts
- Modifier → code fragment → stitched WGSL pattern (maps to our kernel DSL)
- Zero CPU readback for GPU-authoritative data (particles don't need CPU reads)
- Slab/pool allocator for persistent GPU buffers

## What we should skip for PoC
- Expression graph (overkill for first pass)
- The full Bevy extract/prepare/queue/render pipeline (we have simpler phases)
- Indirect draw (we're doing compute first, rendering via existing Three.js path)

## Key insight for our architecture
The distinction between GPU-authoritative (particles — never read back) and shared (Transform — may need readback) components is critical. Our particle system should be GPU-authoritative. Physics affecting player entities needs readback at a sync point.
