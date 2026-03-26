# Scene Architecture

## Overview

A scene is a reusable composition of nodes — a template that defines a game object, a level, a UI panel, or an entire game. Scenes are analogous to Godot scenes or Unity prefabs.

Scenes are static definitions. They are instantiated into ECS worlds at runtime.

## Scene Definition

A scene is a file that describes a node tree:

```
/scenes/ball
Node
├─ NodeTransform
│  data: { position: [10, 20, 0] }
├─ NodeBody
│  data: { mass: 1, velocity: [0, 0, 0], constraintMode: "2D" }
└─ NodeRenderer
   └─ NodeSphere
      data: { radius: 10, color: "red" }
```

A scene can reference other scenes (nesting):

```
/scenes/spaceship
Node
├─ NodeTransform
├─ NodeBody
├─ NodeRenderer
│  └─ NodeMesh
│     data: { geometry: "./meshes/ship" }
└─ NodeScene
   data: { scene: "./scenes/shipInterior" }
```

## Instantiation

Scenes are instantiated into an ECS world. The process:

1. Read the scene's node tree
2. For each node with simulation-relevant data (Transform, Body, etc.), create components on an entity in the target ECS
3. Rendering nodes (Mesh, Light, etc.) are NOT added as ECS components — they stay on the static scene definition for the view layer to reference
4. The entity stores a reference back to its source scene (for the view layer to look up visual data)
5. The ECS world may override any default values from the scene (e.g. repositioning a spawned entity)

After instantiation, the ECS owns all runtime state. The scene definition is not consulted again for simulation — only for visual data and re-instantiation.

## Scene Types by Purpose

### Game Object Scenes
Small, reusable: a ball, an astronaut, a projectile. Instantiated as entities within an ECS.

```
/scenes/astronaut
Node
├─ NodeTransform
├─ NodeBody
├─ NodeRenderer
│  └─ NodeMesh
└─ NodeHealth
   data: { current: 100, max: 100 }
```

### Simulation Scenes
Contain a NodeECS that runs systems. Entities are spawned inside them.

```
/scenes/shipInterior
NodeECS
  data:
    systems: [Physics2D, AstronautAI]
├─ NodeTilemap
│  data: { map: "./maps/ship_interior" }
└─ NodeSceneSpawner
   data: { scenes: ["./scenes/astronaut"], count: 4 }
```

### Structural Scenes
Compose other scenes into a game. May or may not have their own ECS.

```
/scenes/game
NodeECS
  data:
    systems: [SpacePhysics, ShipAI, AsteroidSpawner]
├─ NodeSceneSpawner
│  data: { scenes: ["./scenes/spaceship"], count: 1 }
└─ NodeCamera
   data: { projection: "perspective", fov: 75 }
```

## Scene Nesting and ECS Hierarchy

Scenes can nest, and each NodeECS creates its own World. This produces a tree of ECS instances:

```
Game (NodeECS: space simulation)
├─ Spaceship (entity in Game's ECS)
│  └─ ShipInterior (NodeECS: interior simulation)
│     ├─ Astronaut 1 (entity in ShipInterior's ECS)
│     ├─ Astronaut 2 (entity in ShipInterior's ECS)
│     └─ Astronaut 3 (entity in ShipInterior's ECS)
├─ Asteroid 1 (entity in Game's ECS)
└─ Asteroid 2 (entity in Game's ECS)
```

The spaceship is an entity in the Game ECS. Its node tree includes a NodeScene pointing to shipInterior, which has its own NodeECS. The astronauts are entities in the shipInterior ECS, not the Game ECS.

### Resolution Order

ECS worlds tick root-to-leaf. The Game ECS ticks first, then the ShipInterior ECS. This ensures parent authority — the parent has already committed its state before children process.

## NodeSceneSpawner

A NodeSceneSpawner instantiates scene templates as entities within the nearest ancestor NodeECS. It defines:

- Which scenes to instantiate
- How many
- Initial configuration overrides

At runtime, it reads each scene's node tree, creates entities with the appropriate components, and registers them in the ECS. The spawner can be triggered at startup or dynamically by game logic.
