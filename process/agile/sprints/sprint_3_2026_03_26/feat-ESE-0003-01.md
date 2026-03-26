## Status
inDevelopment

## Title
feat-ESE-0003-01: Implement entity ID management

## Description
Implement the dense/sparse set for entity ID management with generational recycling. Entities are plain integer IDs. Destroyed IDs are reclaimed. Generation counter in upper bits prevents stale ID aliasing.

## Acceptance Criteria
- Entity IDs are plain numbers
- Dense/sparse set tracks alive entities
- createEntity returns a new or recycled ID
- destroyEntity frees the ID for reuse
- Generational counter prevents stale ID usage
- hasEntity checks if an ID is currently alive

## Testing Scenarios
- Create 10 entities, verify unique IDs
- Destroy entity 5, create a new entity, verify ID 5 is recycled
- Access a destroyed entity's generation, verify it's stale

## Testing Notes
Unit tests in engine/ecs/entity.test.ts

## Size
1

## Subtasks

## Started
2026-03-26T05:51:49.262Z
## Completed

## Blockers

## Knowledge Gaps

## Comments
