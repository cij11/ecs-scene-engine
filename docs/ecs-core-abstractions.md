# ECS Core Abstractions

## Overview

The engine uses an Entity-Component-System (ECS) architecture. Each scene in the scene tree is a World with its own ECS. The design prioritises plain data, plain functions, and TypeScript type safety. There are no base classes to extend.

## World

A World is the container for a single ECS instance. One World exists per scene.

A World contains:
- **Entity index** — dense/sparse set mapping entity IDs to their component masks
- **Component storage** — SoA (Structure of Arrays) backing stores, keyed by component schema
- **Query cache** — live result sets, incrementally maintained as entities change
- **System pipeline** — an ordered list of system functions to execute each tick

Worlds are created and destroyed as scenes are added to and removed from the scene tree. A World has no knowledge of its position in the scene tree — inter-scene communication is handled by the scene layer via signals (up) and calls (down).

## Entity

An entity is a plain integer ID. Nothing more.

- IDs are managed via a dense/sparse set with generational recycling. When an entity is destroyed, its ID is reclaimed. A generation counter in the upper bits prevents stale ID aliasing.
- Entities have no data of their own. They are an index into component storage.
- Creating an entity reserves an ID and optionally attaches an initial set of components.
- Destroying an entity removes all its components and frees the ID for reuse.

## Component

A component is a named, typed data schema. Components hold data. They have no behaviour.

### Storage

Components use Structure of Arrays (SoA) layout. Each field in a component schema maps to a contiguous TypedArray, indexed by entity ID.

```
// Conceptual example
Position schema: { x: Float32Array, y: Float32Array }
Velocity schema: { vx: Float32Array, vy: Float32Array }
```

This layout is cache-friendly for systems that iterate over many entities touching the same fields.

### Kinds

- **Data components** — carry typed fields (SoA storage). Used for state that changes over time.
- **Tag components** — carry no data. Used as boolean flags for filtering (e.g. `IsActive`, `IsPlayer`).

### Core and Extension Components

Components are classified as **core** or **extension**:

- **Core components** are foundational and common across many games. They live in `engine/`. Examples: `Transform`, `Velocity`, `Hierarchy`, `Lifecycle`, `Collider`.
- **Extension components** are specific to a particular game. They live in `game/`. Examples: `Inventory`, `QuestProgress`, `SpellCooldown`.

Core components are provided by the engine. Extension components are defined by the game and registered with the World at scene creation time. The engine has no knowledge of extension components — it only provides the mechanism.

### Membership

Component membership is tracked via bitmasks. Each component schema is assigned a bit position. Checking whether an entity has a component is a single bitwise AND.

## System

A system is a plain function with the signature:

```
(world: World, dt: number) => void
```

Systems contain all behaviour. They query for entities with specific component combinations and operate on their data. Systems have no state of their own — if a system needs state, it stores it in components.

### Execution

Systems are composed into an ordered pipeline. Each tick, the pipeline runs each system in sequence, passing the World and delta time. The order is explicit — there is no automatic dependency resolution.

### Core and Extension Systems

Systems are classified as **core** or **extension**:

- **Core systems** handle foundational concerns common across games. They live in `engine/`. Examples: `movementSystem` (applies velocity to transform), `hierarchySystem` (propagates parent transforms), `lifecycleSystem` (processes entity creation/destruction queues).
- **Extension systems** implement game-specific logic. They live in `game/`. Examples: `combatSystem`, `inventorySystem`, `questSystem`.

Core systems are provided by the engine and run as part of the default pipeline. Core systems may, in future, be offloaded to C (via WASM) or shader (via compute shaders) processes for speed. The API boundary between core and extension systems is designed with this in mind.

Extension systems implement game-specific logic and are always TypeScript. They are added by the game, inserted into the pipeline at defined points (before or after core systems, or at explicit phases).

### Pipeline Phases

The system pipeline is divided into phases to give extension systems clear insertion points:

1. **Pre-update** — input processing, network message ingestion
2. **Update** — core simulation (movement, physics, hierarchy)
3. **Post-update** — game logic (combat, AI, quests)
4. **Pre-render** — state preparation for the view layer
5. **Cleanup** — deferred destruction, component removal commits

Extension systems are registered into a phase. Core systems occupy well-known positions within their phases.

## Query

A query declares a set of component requirements and returns a live set of matching entity IDs.

- **All-of** — entity must have all listed components
- **None-of** — entity must have none of the listed components
- **Any-of** — entity must have at least one of the listed components

### Live Result Sets

Queries are not re-evaluated each frame. They maintain a live set (dense/sparse) that is incrementally updated whenever a component is added to or removed from an entity. Iterating a query result is a direct loop over a packed array.

### Deferred Removal

When a component is removed during iteration, the removal is staged in a buffer. Removals are committed at the end of the current system or at the start of the next query read. This allows safe mutation during iteration.

### Caching

Queries with the same component signature are deduplicated. The first call creates the query and populates it; subsequent calls return the cached live set.
