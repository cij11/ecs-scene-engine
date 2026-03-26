## Status
done

## Title
feat-ESE-0005-07: Export view public API

## Description
Create the view barrel export at view/index.ts, exposing the Renderer interface, ThreeJSRenderer, view sync layer, node type handlers, and ComponentSceneRef.

## Acceptance Criteria
- view/index.ts exports all public types and functions
- Internal Three.js details are not exported
- Consumers can import everything from a single path

## Testing Scenarios
- Import from view/index.ts, verify all documented API is accessible

## Testing Notes
Smoke test in view/index.test.ts

## Size
1

## Subtasks

## Team
unknown
## Started
2026-03-26T07:59:48.615Z
## Completed
2026-03-26T08:00:27.443Z
## Blockers
- feat-ESE-0005-06 (needs all modules to exist)

## Knowledge Gaps

## Comments
