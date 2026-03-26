# View–ECS Integration

How the view (human-facing) relates to the ECS (logic-facing) by way of nodes and scenes.

## The Two Data Sources

The view reads from two sources:

1. **Static node data** — mesh, material, light definitions on the scene's node tree. These never change at runtime.
2. **Dynamic ECS data** — transform, position, rotation from ECS entities. These change every tick.

The view combines them: it uses the ECS entity's Transform to position a Three.js object, and the source scene's rendering nodes to determine what that object looks like.

### Why split?

- The ECS stays lean — only simulation-relevant components (Transform, Body, Health) in SoA arrays
- Rendering data (mesh geometry, material textures) doesn't waste space in ECS component arrays
- Rendering data is static — it's defined once in the scene and never changes. No need to track it per-tick.

## Entity → Scene Reference

Each entity in an ECS stores a reference to its source scene definition. This is a lightweight component:

```
ComponentSceneRef: { sceneId: Uint32Array }
```

The view uses this to look up the entity's rendering nodes:
1. Query the ECS for entities with Transform + SceneRef
2. For each entity, read Transform from ECS (position, rotation, scale)
3. Read SceneRef, look up the static scene definition
4. Walk the scene's node tree for NodeRenderer / NodeMesh / NodeLight
5. Sync to Three.js objects

## Architecture: Push-Based Sync

The relationship between ECS and view is one-directional and push-based (inspired by Godot's RenderingServer pattern):

```
ECS World (dynamic state)     Static Scene Nodes (visual data)
        │                              │
        │ read Transform               │ read Mesh, Material, Light
        ▼                              ▼
      View Sync Layer (bridge)
        │
        │ create / update / remove Three.js objects
        ▼
      Three.js Scene Graph (derived cache)
        │
        │ render
        ▼
      Canvas / WebGPU Context (browser)
```

The view never writes back to the ECS or modifies scene nodes.

## Entity Lifecycle in the View

**Entity appears** (SceneRef + Transform components added):
- View sync reads the source scene's rendering nodes
- Creates corresponding Three.js objects (Mesh, Light, etc.)
- Positions them using the entity's Transform
- Maps entity ID → Three.js object(s)

**Entity updates** (Transform changes each tick):
- View sync reads new Transform values
- Updates Three.js object position/rotation/scale in place

**Entity removed** (entity destroyed in ECS):
- Three.js objects are removed from the scene graph and disposed
- Mapping is cleaned up

## Coordinate Systems

Game space and rendering space use the **same coordinate system** — no remapping at the boundary.

- **Right-handed, Y-up** (matching Three.js defaults)
- Units are game units (application-defined)
- NodeTransform stores position (vec3), rotation (quaternion), scale (vec3)
- Values copy directly to Three.js objects

## Multiple ECS Worlds

When multiple ECS worlds exist in a hierarchy (space simulation → ship interior), each world's renderable entities are synced to the Three.js scene graph independently.

The view traverses the ECS hierarchy root-to-leaf (same order as ticking). Each world's entities are positioned in their own coordinate space. The parent entity's transform determines where the child world is positioned in the parent's space.

Example: the spaceship entity in the Space ECS has a transform at `[100, 50, 0]`. The ship interior ECS entities have local transforms. The view applies the spaceship's transform as a parent transform for all interior entities, placing them correctly in world space.

## Recursive Views (Viewports)

Mirrors, security cameras, portals — these use render-to-texture via Three.js RenderTarget.

A Viewport node on a scene defines:
- A Camera (what it sees)
- A render target (where it draws)
- Recursion depth limit

Each frame, viewport cameras render first (to their textures), then the main camera renders (using those textures on meshes). Recursive depth is configurable per viewport.

## Sleeping and Static Scenes

Sleeping and static ECS worlds still have renderable entities. Their ECS doesn't tick, but their Transform and SceneRef components are valid. The view continues to render them — they just don't move.

A scene explicitly marked as invisible is skipped by the view sync layer entirely.

## Related Documents

- [node-architecture.md](node-architecture.md) — node types and static data
- [scene-architecture.md](scene-architecture.md) — scene composition and instantiation
- [ecs-core-abstractions.md](ecs-core-abstractions.md) — ECS World, Entity, Component, System, Query
- [inter-ecs-communication.md](inter-ecs-communication.md) — ports, requests, signals between ECS worlds
- [view-layer.md](view-layer.md) — renderer interface, Three.js, directory structure
