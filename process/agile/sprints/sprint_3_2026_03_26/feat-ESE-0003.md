## Status
inDevelopment

## Title
feat-ESE-0003: Create ECS core abstractions

## Description
Implement the ECS core as defined in docs/ecs-core-abstractions.md. This is the foundational runtime — World, Entity, Component, System, Query — that all scenes will use. Plain data, plain functions, TypeScript type safety, no base classes.

## Acceptance Criteria
- World can be created and destroyed
- Entities can be created, destroyed, and recycled (generational IDs)
- Data components can be defined with typed SoA schemas
- Tag components can be defined (no data, boolean flag)
- Components can be added to and removed from entities
- Component membership is tracked via bitmasks
- Systems are plain functions registered in an ordered pipeline
- Pipeline supports phases (pre-update, update, post-update, pre-render, cleanup)
- Queries return live result sets (all-of, none-of, any-of)
- Queries are incrementally maintained (not re-evaluated each frame)
- Deferred removal allows safe mutation during iteration
- Query results are cached by component signature
- World tick runs the system pipeline with delta time
- All public API is exported from engine/index.ts

## Testing Scenarios
- Create a world, add entities with components, tick a system, verify state changes
- Destroy an entity, verify its ID is recycled on next create
- Query for entities with component A and not component B, verify correct results
- Remove a component during iteration, verify deferred removal works
- Define two queries with the same signature, verify they share the same result set
- Register systems in different phases, verify execution order

## Testing Notes
Unit tests for all ECS primitives. Co-located with source files in engine/ecs/.

## Size
Sum of subtasks (8)

## Subtasks
- feat-ESE-0003-01: Implement entity ID management (dense/sparse set, generational recycling) (1pt)
- feat-ESE-0003-02: Implement component schema definition and SoA storage (2pt)
- feat-ESE-0003-03: Implement bitmask component membership tracking (1pt)
- feat-ESE-0003-04: Implement tag components (1pt)
- feat-ESE-0003-05: Implement query engine (all-of, none-of, any-of, live sets, deferred removal) (2pt)
- feat-ESE-0003-06: Implement system pipeline with phases (1pt)
- feat-ESE-0003-07: Implement World (ties together entity, component, query, pipeline) (1pt)
- feat-ESE-0003-08: Export public API from engine/index.ts (1pt)

## Started
2026-03-26T05:51:47.897Z
## Completed

## Blockers

## Knowledge Gaps
- Optimal initial TypedArray sizes and growth strategy for SoA storage
- Maximum entity count / bitmask generation overflow handling

## Comments
Architecture defined in docs/ecs-core-abstractions.md. Reference implementations studied in references/bitecs/ and references/harmony-ecs/.
