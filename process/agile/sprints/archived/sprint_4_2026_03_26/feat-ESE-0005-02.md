## Status
done

## Title
feat-ESE-0005-02: Implement ComponentSceneRef and visual lookup

## Description
Implement the ComponentSceneRef core component that links ECS entities to their source scene definition. Implement a lookup function that, given a SceneRef, walks the static scene node tree to find rendering nodes (NodeMesh, NodeLight, NodeCamera, etc.).

## Acceptance Criteria
- ComponentSceneRef is a core ECS component with a sceneId field
- A scene registry maps sceneId → scene node tree
- lookupVisualNodes(sceneId) returns the rendering nodes from the static scene
- Rendering nodes are identified by node type (NodeRenderer subtree)

## Testing Scenarios
- Register a scene, create entity with SceneRef, look up visual nodes
- Scene with no rendering nodes returns empty result
- Scene with nested NodeRenderer → NodeMesh returns the mesh node

## Testing Notes
Unit tests in engine/ or view/.

## Size
1

## Subtasks

## Team
unknown
## Started
2026-03-26T07:53:31.705Z
## Completed
2026-03-26T07:54:58.238Z
## Blockers

## Knowledge Gaps

## Comments
