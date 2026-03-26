## Status
done

## Title
feat-ESE-0005: Create view architecture

## Description
Implement the view layer as defined in docs/view-layer.md and docs/view-ecs-integration.md.

The view reads from two sources:
- **ECS** for dynamic state (Transform via ComponentSceneRef)
- **Static scene nodes** for visual data (NodeMesh, NodeMaterial, NodeLight, NodeCamera)

Rendering data is NOT stored in ECS components. The view looks up the entity's source scene definition via a SceneRef component and walks the node tree for rendering nodes.

Uses Three.js as the rendering library. Three.js WebGPURenderer is the primary backend with automatic WebGL fallback. Our Renderer interface wraps Three.js — Three.js is just the draw call layer.

## Acceptance Criteria
- Renderer interface defined, wrapping Three.js without leaking Three.js types to consumers
- ComponentSceneRef core component links ECS entities to their source scene's visual nodes
- View sync layer reads ECS Transform + SceneRef, reads scene nodes for Mesh/Material/Light/Camera, and creates/updates/removes Three.js objects
- Entity ID → Three.js object mapping maintained by the view
- View reads engine state and static nodes but never mutates either
- Browser entry point initialises the renderer and connects it to the game loop
- A visible 3D scene renders in the browser via `npm run dev`
- All public API exported from view/index.ts

## Testing Scenarios
- Create a world, instantiate a scene with NodeMesh + NodeTransform, verify Three.js object is created
- Update entity Transform in ECS, verify Three.js object position updates
- Destroy entity, verify Three.js object is removed and disposed
- Entity without SceneRef is not rendered
- Scene with NodeLight produces a Three.js light
- Camera entity controls the viewport
- Renderer init/destroy lifecycle works correctly

## Testing Notes
Unit tests for view sync layer with mock renderer. Three.js renderer tested manually via dev server.

## Size
Sum of subtasks (9)

## Subtasks
- feat-ESE-0005-01: Define Renderer interface (1pt)
- feat-ESE-0005-02: Implement ComponentSceneRef and scene node visual lookup (1pt)
- feat-ESE-0005-03: Implement Three.js renderer (2pt)
- feat-ESE-0005-04: Implement view sync layer (entity ↔ Three.js object lifecycle) (2pt)
- feat-ESE-0005-05: Implement node type handlers — NodeMesh, NodeLight, NodeCamera (1pt)
- feat-ESE-0005-06: Integrate with browser entry point and game loop (1pt)
- feat-ESE-0005-07: Export view public API (1pt)

## Team
unknown
## Started
2026-03-26T07:52:58.811Z
## Completed
2026-03-26T08:00:28.466Z
## Blockers
- feat-ESE-0003 (needs ECS core — done)

## Knowledge Gaps
- Three.js WebGPURenderer API stability
- Incremental sync strategy: how to detect which entities changed Transform this tick without scanning all entities

## Comments
Architecture defined in docs/view-layer.md, docs/view-ecs-integration.md, docs/node-architecture.md.
