## Status
readyForDev

## Title
feat-ESE-0003-04: Implement tag components

## Description
Implement tag components — components with no data, used as boolean flags for query filtering. Tags participate in bitmask membership but allocate no SoA storage.

## Acceptance Criteria
- defineTag creates a component with no data fields
- Tags are tracked in the bitmask like data components
- Tags allocate no SoA storage
- hasComponent works with tags
- Tags can be used in queries

## Testing Scenarios
- Define an IsPlayer tag, add to entity, verify hasComponent
- Query for entities with IsPlayer tag, verify correct results
- Verify no TypedArrays are allocated for the tag

## Testing Notes
Unit tests in engine/ecs/component.test.ts

## Size
1

## Subtasks

## Started

## Completed

## Blockers
- feat-ESE-0003-03 (needs bitmask tracking)

## Knowledge Gaps

## Comments
