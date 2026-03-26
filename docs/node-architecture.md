# Node Architecture

## Overview

Nodes are the fundamental building block of the engine. A node is a typed, static data container that can be arranged in a hierarchy. Nodes define structure and default properties. They are never mutated at runtime.

## Node Basics

A node has:
- **Type** — determines what data it carries and how it is interpreted (e.g. `NodeTransform`, `NodeMesh`, `NodeECS`)
- **Data** — typed properties defined by the node type
- **Children** — an ordered list of child nodes

The default type is `Node` — a generic container with no special data, used for grouping.

## Node Types

### Structural
- **Node** — generic container, no data
- **NodeTransform** — position (vec3), rotation (quaternion), scale (vec3)

### Physics
- **NodeBody** — mass, velocity, collision shape, constraint mode (2D/3D)

### Rendering
- **NodeRenderer** — marks this subtree as renderable
- **NodeMesh** — geometry reference, material reference
- **NodeLight** — type (point, directional, spot), colour, intensity, range
- **NodeCamera** — projection, FOV, near/far

### Simulation
- **NodeECS** — creates an ECS World, defines systems, runs simulation
- **NodeSceneSpawner** — instantiates scene templates as entities within the nearest ancestor NodeECS

### Composition
- **NodeScene** — reference to another scene definition (nesting)

## Nodes Are Static Templates

Nodes are blueprints. They define starting and default properties. At runtime:

1. A scene's node tree is read to **instantiate** entities in an ECS
2. Node data seeds the entity's initial component values
3. After instantiation, the node is not referenced by the ECS for simulation
4. The ECS owns all runtime state — transforms, velocities, health, everything dynamic

The node tree remains available as a static reference for:
- The view layer (to look up mesh/material data)
- Re-instantiation (spawning another copy)
- Editor tooling

## Hierarchy Example

```
/scenes/spaceship
Node
├─ NodeTransform
│  data: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
├─ NodeBody
│  data: { mass: 100, velocity: [0, 0, 0] }
├─ NodeRenderer
│  └─ NodeMesh
│     data: { geometry: "./meshes/ship", material: "./materials/hull" }
└─ NodeScene
   data: { scene: "./scenes/shipInterior" }
```

When this scene is instantiated into a parent ECS (e.g. a space simulation), the ECS creates an entity with Transform and Body components seeded from the node data. The NodeRenderer and NodeMesh are not added as ECS components — they remain on the static node for the view layer to reference.

## 2D and 3D

Everything is 3D from the start. A "2D game" uses 3D nodes with constraints:

- **NodeTransform** always stores 3D data
- **NodeBody** has a `constraintMode` property: `3D` (default), `2D` (locks Z position, locks X/Y rotation)
- Physics systems check constraint mode and skip constrained axes
- The camera uses orthographic projection for a 2D feel

One set of node types, one physics path, one renderer.
