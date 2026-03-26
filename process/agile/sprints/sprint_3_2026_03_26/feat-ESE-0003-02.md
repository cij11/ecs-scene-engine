## Status
done

## Title
feat-ESE-0003-02: Implement component schema definition and SoA storage

## Description
Implement the component definition API and SoA backing storage. Each field in a component schema maps to a contiguous TypedArray indexed by entity ID.

## Acceptance Criteria
- defineComponent accepts a schema mapping field names to TypedArray constructors
- SoA storage is allocated with an initial capacity and grows as needed
- addComponent attaches a component to an entity and optionally sets initial values
- removeComponent detaches a component from an entity
- getComponent returns typed access to an entity's component data
- hasComponent checks if an entity has a component

## Testing Scenarios
- Define a Position component { x: Float32Array, y: Float32Array }
- Add Position to entity, set x=10, y=20, read back values
- Remove Position from entity, verify hasComponent returns false
- Create entities beyond initial capacity, verify storage grows

## Testing Notes
Unit tests in engine/ecs/component.test.ts

## Size
2

## Subtasks

## Started
2026-03-26T05:53:53.786Z
## Completed
2026-03-26T05:54:54.894Z
## Blockers
- feat-ESE-0003-01 (needs entity IDs)

## Knowledge Gaps
- Initial capacity and growth factor for TypedArrays

## Comments
