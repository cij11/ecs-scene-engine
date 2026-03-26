## Status
done

## Title
feat-ESE-0003-07: Implement World

## Description
Implement the World type that ties together entity management, component storage, query cache, and system pipeline into a single container. One World per scene.

## Acceptance Criteria
- createWorld returns a World with entity index, component storage, query cache, and pipeline
- destroyWorld cleans up all resources
- world.tick(dt) runs the system pipeline and commits deferred operations
- World exposes entity, component, query, and pipeline operations
- Multiple worlds can coexist independently

## Testing Scenarios
- Create two worlds, add different entities to each, verify isolation
- Tick a world, verify systems run and state changes
- Destroy a world, verify cleanup

## Testing Notes
Integration tests in engine/ecs/world.test.ts

## Size
1

## Subtasks

## Started
2026-03-26T06:01:45.055Z
## Completed
2026-03-26T06:04:27.230Z
## Blockers
- feat-ESE-0003-01 through feat-ESE-0003-06

## Knowledge Gaps

## Comments
