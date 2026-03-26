# Sprint 5 Demo — Space Toy Problem

**Date:** 2026-03-26
**Sprint:** sprint_5_2026_03_26
**Ticket:** feat-ESE-0006 (7 subtasks)
**Outcome:** All 7 subtasks completed. 109 tests passing. Build succeeds.

## What Was Built

The first "game" running on the ECS scene engine: a spaceship orbiting in space with astronauts wandering inside it. This exercises the full architecture end-to-end.

### New Engine Capabilities

1. **Core components** (`engine/ecs/components/`)
   - Transform — position, rotation, scale in 3D
   - Velocity — linear velocity

2. **Core systems** (`engine/ecs/systems/`)
   - movementSystem — applies Velocity to Transform each tick

3. **Scene instantiation** (`engine/scene/instantiate.ts`)
   - Reads static node trees and creates ECS entities with appropriate components
   - Simulation nodes (transform, body) → ECS components
   - Rendering nodes → stay on static scene, accessed via SceneRef
   - Supports position/velocity overrides

4. **Nested ECS worlds** (`engine/scene/world-tree.ts`)
   - WorldNode wraps a World with parent/child relationships
   - tickWorldTree runs all worlds root-to-leaf
   - onAfterTick callback for transform propagation between worlds

5. **Transform propagation** (`engine/scene/transform-propagation.ts`)
   - Combines parent + local transforms (position, rotation, scale)
   - Quaternion multiplication for rotation composition
   - Child world entities are positioned in world space relative to parent entity

6. **Multi-world view sync** (`view/sync.ts`)
   - syncWorldTree traverses the world tree
   - Each child world's entities are offset by the parent entity's transform
   - Entities from all worlds render into one Three.js scene

### First Game: toy-ship

- `game/toy-ship/scenes.ts` — spaceship and astronaut scene definitions
- `game/toy-ship/systems.ts` — orbit system (ship orbits origin), wander system (astronauts move randomly within bounds)

## Live Demo

```
npm run dev
```

Opens browser at localhost:3000. You should see:
- A blue cube (spaceship) orbiting the origin
- Three green cubes (astronauts) moving around, tracking the ship's position through space
- Point light and ambient light illuminating the scene

## Architecture Validation

| Check | Result |
|-------|--------|
| Tests pass | 109/109 |
| Build succeeds | Yes (517 kB bundle) |
| All source files present | 16/16 |
| engine/ does not import view/ | Verified |
| engine/ does not import game/ | Verified |
| game/ does not import view/ | Verified |
| game/ does not import browser/ | Verified |
| Root-to-leaf tick order | Verified (unit test) |
| Transform propagation | Verified (unit test — rotation, scale, position) |
| Scene instantiation | Verified (unit test — 7 scenarios) |
| Multi-world rendering | Verified (build + visual) |

## QA Outcomes

| Module | Tests | Result |
|--------|-------|--------|
| Core components (Transform, Velocity) | via movement system | Pass |
| Movement system | 4 | Pass |
| Scene instantiation | 7 | Pass |
| Node system | 11 | Pass (from sprint 4) |
| World tree | 7 | Pass |
| Transform propagation | 6 | Pass |
| View sync (including multi-world) | 6 | Pass (from sprint 4) |
| ECS core | 58 | Pass (from sprint 3) |
| **Total** | **109** | **All pass** |

## Key Design Decisions Exercised

1. **Nodes are static templates** — astronaut/spaceship scenes define defaults, ECS owns runtime state
2. **ECS is opt-in** — space world and interior world are separate ECS instances
3. **Rendering data stays on nodes** — SceneRef links entity to visual data, mesh/material never in ECS
4. **Root-to-leaf ticking** — space ticks first, interior ticks after
5. **Transform propagation** — interior astronauts positioned relative to orbiting ship
6. **Module boundaries respected** — engine/ → game/ → view/ → browser/ dependency chain clean

## Stakeholder Review

Run `npm run dev` to review. Key questions to consider:
- Does the ship orbit smoothly?
- Do the astronauts track with the ship through space?
- Are the astronauts wandering within their bounds?

## Artifacts

- [engine/ecs/components/](../../../../engine/ecs/components/) — Transform, Velocity
- [engine/ecs/systems/](../../../../engine/ecs/systems/) — movementSystem
- [engine/scene/instantiate.ts](../../../../engine/scene/instantiate.ts) — scene instantiation
- [engine/scene/world-tree.ts](../../../../engine/scene/world-tree.ts) — nested ECS worlds
- [engine/scene/transform-propagation.ts](../../../../engine/scene/transform-propagation.ts) — parent/child transform math
- [game/toy-ship/](../../../../game/toy-ship/) — first game: scenes + systems
- [browser/main.ts](../../../../browser/main.ts) — game bootstrap and loop
