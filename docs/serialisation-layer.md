# Serialisation Layer

## Overview

The serialisation layer sits between the engine and external systems — both networking and persistence. It provides a single format for representing scene/world state that can be transmitted over the network or saved to storage.

The engine emits and receives signals via this layer. The engine itself has no knowledge of networking or persistence — it only knows how to serialise and deserialise its state.

## Location

The serialisation layer lives in `engine/serialisation/`. It is part of the engine because it needs access to engine internals (World state, component storage, entity indices), but its output is a portable format consumed by external systems.

## What Gets Serialised

### Scene state

A serialised scene captures:
- Scene metadata (processing mode, priority, sleep state)
- All entities and their component data
- Signal connections between the scene and its children
- Child scene references (for tree reconstruction)

### World state (within a scene)

A serialised world captures:
- Entity list (active IDs)
- For each entity: its component set and the data for each component
- System pipeline configuration (which systems, in what order)

### Selective serialisation

Not everything needs to be serialised every time. The serialiser supports:
- **Full snapshot** — the complete state of a scene/world. Used for save/load and initial network sync.
- **Delta** — only the changes since the last snapshot. Used for network updates and incremental saves.
- **Filtered** — only specific components or entities. Used when a consumer only needs partial state (e.g. a client that only needs visible entities).

## Serialisation Format

The format is a binary or structured representation (implementation TBD) that is:
- **Compact** — minimal overhead for network transmission
- **Deterministic** — the same state always produces the same output
- **Versionable** — format changes can be detected and migrated

### Component schema registry

Each component schema has a unique string identifier registered with the serialiser. This allows the deserialiser to reconstruct components by name rather than by memory layout, enabling:
- Different builds to communicate (as long as schemas with the same name have compatible shapes)
- Saved games to be loaded after code changes (with migration for schema changes)

## Networking Integration

The networking layer (external to the engine) consumes serialised state:

```
Engine → Serialiser → Network Transport → Deserialiser → Engine
```

### Outbound (engine → network)

1. A system or the scene tree produces a state change
2. The serialiser captures a delta (or full snapshot on connect)
3. The networking layer sends the serialised data to peers

### Inbound (network → engine)

1. The networking layer receives serialised data from a peer
2. The deserialiser reconstructs the state changes
3. The changes are applied to the local engine state

### Authority model

The serialisation layer is agnostic to authority. It serialises and deserialises — it does not decide who is allowed to change what. Authority is the networking layer's responsibility.

## Persistence Integration

The same serialisation format is used for saving and loading game state:

```
Engine → Serialiser → Storage (file, IndexedDB, etc.)
Storage → Deserialiser → Engine
```

### Save

1. Serialise the full scene tree (or a subtree) as a snapshot
2. Write to storage

### Load

1. Read from storage
2. Deserialise into scenes and worlds
3. Attach to the scene tree

### Scene files (prefabs)

Scene file serialisation (for prefab definitions) uses the same format. A prefab file is a serialised scene snapshot. Instantiation is deserialisation.

## API Surface

Exported from `engine/index.ts`:

- **serialiseScene(scene, options)** — serialise a scene (full, delta, or filtered)
- **deserialiseScene(data)** — reconstruct a scene from serialised data
- **serialiseWorld(world, options)** — serialise a world's entity/component state
- **deserialiseWorld(world, data)** — apply serialised state to a world
- **registerSchema(name, schema)** — register a component schema for serialisation
- **SerialisationOptions** — type for snapshot/delta/filtered modes

## Import Rules

1. The serialisation layer lives in `engine/serialisation/` and imports from other engine modules freely.
2. External consumers (networking layer, persistence layer) import serialisation functions from `engine/index.ts`.
3. The serialisation layer never imports from `game/`, `view/`, or `browser/`.
4. Extension components defined in `game/` must be registered with `registerSchema` to be serialisable.
