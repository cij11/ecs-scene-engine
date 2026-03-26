## Status
done

## Title
feat-ESE-0005-04: Implement view sync layer

## Description
Implement the sync layer that bridges ECS entities and Three.js objects. Each frame it queries the ECS for entities with Transform + SceneRef, looks up visual nodes from the static scene, and creates/updates/removes Three.js objects via the Renderer interface.

## Acceptance Criteria
- Queries ECS for entities with Transform + ComponentSceneRef
- On entity appear: looks up scene visual nodes, creates renderer objects, stores entity → handle mapping
- On entity update: reads Transform from ECS, updates renderer object position/rotation/scale
- On entity remove: removes renderer object, cleans up mapping
- Handles multiple ECS worlds in hierarchy (root-to-leaf traversal)

## Testing Scenarios
- Entity with SceneRef added → Three.js object created
- Entity Transform changes → Three.js object position updates
- Entity destroyed → Three.js object removed
- Entity without SceneRef → ignored
- Two ECS worlds with renderable entities → both synced

## Testing Notes
Unit tests with mock Renderer.

## Size
2

## Subtasks

## Team
unknown
## Started
2026-03-26T07:57:02.142Z
## Completed
2026-03-26T07:58:25.639Z
## Blockers
- feat-ESE-0005-02 (need SceneRef and visual lookup)
- feat-ESE-0005-03 (need renderer to dispatch to)

## Knowledge Gaps
- Incremental sync: detecting which entities changed Transform this tick

## Comments
