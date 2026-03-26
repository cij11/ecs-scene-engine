# Engine Module Structure

## Overview

The `engine/` directory contains the game engine — everything needed to run an ECS scene tree. It is game-agnostic. Nothing in `engine/` imports from `game/`, `view/`, or `browser/`.

## Directory Structure

```
engine/
├── index.ts              — public API barrel export
├── ecs/
│   ├── world.ts          — World creation, destruction, tick
│   ├── entity.ts         — entity ID management (dense/sparse set, generational recycling)
│   ├── component.ts      — component schema definition, SoA storage, bitmask registration
│   ├── system.ts         — system type definition, pipeline composition
│   └── query.ts          — query declaration, live result sets, deferred removal
├── scene/
│   ├── scene.ts          — Scene type (wraps a World + tree node)
│   ├── scene-tree.ts     — tree management (add, remove, reparent)
│   ├── lifecycle.ts      — lifecycle state machine, hooks (onEnterTree, onReady, etc.)
│   ├── processing.ts     — processing list, priority scheduling, sleep/wake
│   └── signal.ts         — signal declaration, emission, connection
├── core-components/
│   ├── index.ts          — barrel export for all core components
│   ├── transform.ts      — position, rotation, scale
│   ├── velocity.ts       — linear and angular velocity
│   ├── hierarchy.ts      — parent/child relationship data for transform propagation
│   ├── lifecycle.ts      — creation/destruction flags, age, TTL
│   └── collider.ts       — collision shape, layer, mask
├── core-systems/
│   ├── index.ts          — barrel export for all core systems
│   ├── movement.ts       — applies velocity to transform
│   ├── hierarchy.ts      — propagates parent transforms to children
│   ├── lifecycle.ts      — processes entity creation/destruction queues
│   └── collision.ts      — broad/narrow phase collision detection
├── pipeline/
│   ├── pipeline.ts       — system pipeline builder (phases, ordering)
│   └── phases.ts         — phase definitions (pre-update, update, post-update, pre-render, cleanup)
└── serialisation/
    ├── serialiser.ts     — serialise world/scene state to a portable format
    └── deserialiser.ts   — restore world/scene state from serialised data
```

## Public API Surface

The engine exports through `engine/index.ts`. This is the only import path that `game/`, `view/`, and `browser/` should use.

### For game/

Game code needs to define extension components, extension systems, compose scenes, and build the game's scene tree.

Exports:
- **World** — `createWorld`, `destroyWorld`, `tick`
- **Entity** — `createEntity`, `destroyEntity`, `hasEntity`
- **Component** — `defineComponent`, `defineTag`, `addComponent`, `removeComponent`, `hasComponent`, `getComponent`
- **System** — system type signature, pipeline registration
- **Query** — `defineQuery`, `Not`, `Any` modifiers
- **Scene** — `createScene`, `addChild`, `removeChild`, `reparent`
- **Signal** — `defineSignal`, `emit`, `connect`, `disconnect`
- **Lifecycle** — lifecycle hook registration
- **Processing** — `sleep`, `wake`, processing mode constants
- **Pipeline** — `createPipeline`, phase constants, `insertSystem`
- **Core components** — `Transform`, `Velocity`, `Hierarchy`, `Lifecycle`, `Collider`
- **Core systems** — `movementSystem`, `hierarchySystem`, `lifecycleSystem`, `collisionSystem`

### For view/

The view layer reads engine state but never mutates it. It needs to traverse scenes and read component data.

Exports:
- **Scene traversal** — `getChildren`, `getParent`, `getRoot`
- **Component reading** — `getComponent`, `hasComponent`
- **Query** — `defineQuery` (read-only iteration)
- **Scene state** — `isActive`, `isSleeping`, `isStatic`

### For browser/

The browser layer needs to create the root scene, start the game loop, and connect the view.

Exports:
- **Bootstrap** — `createGame`, `startLoop`, `stopLoop`
- **Scene tree root** — `getRoot`
- **Tick** — `tick` (if browser manages its own requestAnimationFrame loop)

## Internal vs External Boundaries

### Internal (not exported)

- Entity ID pool internals (dense/sparse arrays, generation counters)
- Bitmask allocation and management
- Query cache internals (hashing, deduplication)
- Processing list sort implementation
- Deferred operation queues
- SoA storage array management

### Rules

1. `engine/` never imports from `game/`, `view/`, or `browser/`.
2. `game/` imports only from `engine/index.ts`.
3. `view/` imports only from `engine/index.ts`. It reads state but never calls mutation functions.
4. `browser/` imports from `engine/index.ts` and `view/` and `game/`.
5. Submodules within `engine/` may import from each other freely. There is no internal layering constraint — `ecs/` and `scene/` are co-dependent by design (a Scene wraps a World).

## Adding New Engine Functionality

### Adding a core component

1. Create a new file in `engine/core-components/`.
2. Define the component schema using `defineComponent`.
3. Export it from `engine/core-components/index.ts`.
4. It becomes available to all consumers via `engine/index.ts`.

### Adding a core system

1. Create a new file in `engine/core-systems/`.
2. Implement the system as a plain function `(world, dt) => void`.
3. Register it at a specific phase in the default pipeline.
4. Export it from `engine/core-systems/index.ts`.

### Adding a new engine subsystem

1. Create a new directory under `engine/` (e.g. `engine/physics/`, `engine/audio/`).
2. Keep internals private to the directory.
3. Export the public API from a local `index.ts`.
4. Re-export from `engine/index.ts`.
