# Lazy ECS Strategy

## Problem

Everything in the game is a scene, and each scene has its own ECS World. A complex game may have hundreds or thousands of scenes in the tree at once — UI elements, particle emitters, static decorations, background tiles, off-screen entities. Running a full ECS tick on every scene every frame would be wasteful and unscalable.

## Principle

A scene's ECS only ticks when it has work to do. By default, scenes are dormant. They must opt in to processing.

## Scene Processing Modes

Each scene has a processing mode that determines when its ECS ticks:

### Active

The scene's ECS runs every frame. Use for scenes with game logic that must execute continuously — player characters, enemies, physics bodies, real-time simulations.

A scene becomes active when:
- It has at least one system registered in its pipeline
- It is not explicitly sleeping
- It is in the tree

### Static

The scene's ECS never ticks. The World exists to hold component data (for the view layer to read), but no systems run. Use for scenes that only display state — text labels, icons, static sprites, decorations.

A static scene has:
- Components (data the view layer reads)
- No systems (nothing to execute)
- No processing cost beyond memory

### Sleeping

The scene's ECS is paused. It was previously active but has been put to sleep. Its systems exist but are not executed. Use for scenes that are temporarily inactive — off-screen entities, paused game elements, pooled objects.

A sleeping scene:
- Retains all its entities, components, and system registrations
- Does not tick
- Can be woken to resume ticking
- Has near-zero processing cost while sleeping

## Sleep / Wake Mechanism

### Explicit sleep

A parent scene can put a child to sleep or wake it:

```
// Conceptual
parent.sleep(child)   // child stops ticking
parent.wake(child)    // child resumes ticking
```

### Self-sleep

A scene can put itself to sleep from within a system. The sleep takes effect at the end of the current tick (deferred), not immediately — the current tick completes normally.

### Cascade sleep

When a scene sleeps, all its descendants also sleep. When a scene wakes, its descendants return to their previous state — a descendant that was explicitly sleeping before the parent slept will remain sleeping.

This means:
- Sleeping a level scene pauses everything in the level
- Waking the level resumes only the scenes that were active before

### Wake triggers

Sleeping scenes can register wake triggers — conditions that automatically wake the scene:

- **Signal trigger** — wake when a specific signal is received from a parent or sibling
- **Timer trigger** — wake after a duration
- **Proximity trigger** — wake when a tracked entity (in a parent/sibling scene) enters a region

Wake triggers are evaluated by the scene tree infrastructure, not by the sleeping scene's ECS (since it's not ticking). This keeps the cost of evaluating triggers minimal.

## Performance Model

### Cost of a dormant scene

A static or sleeping scene costs:
- Memory for its World (entities, component arrays, system registrations)
- No per-frame CPU cost
- No query evaluation
- No system execution

### Cost of processing list management

Active scenes register themselves in a flat processing list (as described in the scene tree architecture). Adding/removing from this list is O(1) amortised. The processing list is only re-sorted when priorities change.

### Budget guidance

The performance target is:
- **Active scenes**: tens to low hundreds per frame. Each runs its full system pipeline.
- **Static scenes**: thousands. Zero processing cost.
- **Sleeping scenes**: hundreds to thousands. Near-zero cost, plus wake trigger evaluation.

A game should structure its scene tree so that only the scenes with meaningful logic are active at any time. Everything else should be static or sleeping.

## Examples

### UI scene tree

```
HUD (static — no systems, just holds children)
├── HealthBar (static — components hold current/max HP, view reads them)
├── Minimap (active — has a system that updates visible entities each frame)
└── DialogBox (sleeping — wakes on "dialog_started" signal)
```

### Level scene tree

```
Level (active — runs level-wide systems like spawning, win conditions)
├── Player (active — movement, input, combat systems)
├── Enemy1 (active — AI, movement systems)
├── Enemy2 (sleeping — off-screen, wakes on proximity trigger)
├── Crate (static — just a sprite and collider, no systems)
└── ParticleEmitter (sleeping — wakes on "explosion" signal)
```

## Relationship to Core and Extension Systems

Core systems (in engine/) respect the sleep/wake mechanism automatically. When a scene is sleeping, none of its systems run — core or extension.

Extension systems (in game/) do not need to implement sleep/wake awareness. The scene tree infrastructure handles this before systems are invoked. A system is only called if its scene is active.
