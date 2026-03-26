# Game Module Structure

## Overview

The `game/` directory contains game-specific code — a particular utilisation of the engine. It imports from `engine/` and defines extension components, extension systems, scene compositions, and game configuration. Multiple games can be built from the same engine by swapping out `game/`.

## Directory Structure

```
game/
├── index.ts                — game entry point, scene tree assembly, pipeline configuration
├── components/
│   ├── index.ts            — barrel export for all extension components
│   └── ...                 — game-specific component schemas (e.g. inventory.ts, quest.ts)
├── systems/
│   ├── index.ts            — barrel export for all extension systems
│   └── ...                 — game-specific systems (e.g. combat.ts, ai.ts)
├── scenes/
│   ├── index.ts            — barrel export for scene factory functions
│   ├── root.ts             — root scene definition (top-level game structure)
│   └── ...                 — scene definitions (e.g. main-menu.ts, level.ts, player.ts)
├── prefabs/
│   ├── index.ts            — barrel export for prefab definitions
│   └── ...                 — reusable scene templates (e.g. enemy.ts, projectile.ts, pickup.ts)
└── config/
    └── ...                 — game configuration (balance tuning, level data, entity definitions)
```

## How game/ Extends the Engine

### Extension Components

Game-specific components are defined using `defineComponent` from the engine. They follow the same rules as core components — SoA storage, typed schemas, bitmask membership — but live in `game/components/`.

```
// Conceptual
import { defineComponent } from 'engine'

const Inventory = defineComponent({ slots: Uint8Array, capacity: Uint8Array })
const Health = defineComponent({ current: Float32Array, max: Float32Array })
```

Extension components are always TypeScript. They are registered with a World when a scene that uses them is created.

### Extension Systems

Game-specific systems are plain functions with the standard `(world, dt) => void` signature. They are inserted into the pipeline at a specific phase.

```
// Conceptual
import { defineQuery, getComponent } from 'engine'
import { Health, Poison } from '../components'

const poisonedEntities = defineQuery([Health, Poison])

const poisonSystem = (world, dt) => {
  for (const eid of poisonedEntities(world)) {
    // apply poison damage
  }
}
```

Extension systems are always TypeScript. They are inserted into pipeline phases — typically `post-update` for game logic, or `pre-update` for input processing.

### Scene Definitions

Scenes are defined as factory functions that create and configure a scene with its components, systems, and children.

```
// Conceptual
import { createScene, addChild, insertSystem } from 'engine'
import { playerMovementSystem, playerCombatSystem } from '../systems'
import { createSprite } from './sprite'
import { createHitbox } from './hitbox'

const createPlayer = () => {
  const scene = createScene({ mode: 'active' })
  insertSystem(scene, 'post-update', playerMovementSystem)
  insertSystem(scene, 'post-update', playerCombatSystem)
  addChild(scene, createSprite({ texture: 'player.png' }))
  addChild(scene, createHitbox({ width: 16, height: 16 }))
  return scene
}
```

### Prefabs

Prefabs are scene definitions intended for repeated instantiation. They live in `game/prefabs/` and are structured identically to scene definitions. The distinction is organisational — prefabs are templates (enemies, projectiles, pickups), while scenes in `game/scenes/` are unique structural pieces (levels, menus, HUD).

### Game Entry Point

`game/index.ts` is the entry point. It:
1. Creates the root scene
2. Assembles the initial scene tree
3. Configures the system pipeline (inserts extension systems into phases)
4. Exports a `createGame` function that `browser/` calls to start

## Import Rules

1. `game/` imports only from `engine/index.ts`. Never from engine internals.
2. `game/` never imports from `view/` or `browser/`.
3. Within `game/`, modules import freely from each other.
4. `browser/` imports `game/index.ts` to bootstrap the game.

## Adding New Game Functionality

### Adding a new component

1. Create a file in `game/components/`.
2. Define the schema with `defineComponent`.
3. Export from `game/components/index.ts`.
4. Use in systems and scene definitions.

### Adding a new system

1. Create a file in `game/systems/`.
2. Implement as a plain function `(world, dt) => void`.
3. Export from `game/systems/index.ts`.
4. Insert into the pipeline in the relevant scene definition.

### Adding a new scene or prefab

1. Create a factory function in `game/scenes/` or `game/prefabs/`.
2. Compose it from engine primitives, extension components/systems, and child scenes.
3. Add it to the scene tree from a parent scene or from the root.
