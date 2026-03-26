## Status
done

## Title
feat-ESE-0005-05: Implement node type handlers

## Description
Implement handlers that translate each rendering node type (NodeMesh, NodeLight, NodeCamera) into renderer object creation parameters. Each handler reads the static node data and produces the arguments needed by the Renderer interface.

## Acceptance Criteria
- NodeMesh handler: reads geometry ref, material ref → creates a mesh object
- NodeLight handler: reads type, colour, intensity, range → creates a light object
- NodeCamera handler: reads projection, FOV, near/far → creates/configures a camera
- Handlers are registered by node type and dispatched by the sync layer

## Testing Scenarios
- NodeMesh node produces correct mesh creation params
- NodeLight with type "point" produces a point light
- NodeCamera with perspective projection sets correct FOV

## Testing Notes
Unit tests per handler.

## Size
1

## Subtasks

## Team
unknown
## Started
2026-03-26T07:56:11.603Z
## Completed
2026-03-26T07:57:00.998Z
## Blockers
- feat-ESE-0005-01 (need Renderer interface to know creation params)

## Knowledge Gaps

## Comments
