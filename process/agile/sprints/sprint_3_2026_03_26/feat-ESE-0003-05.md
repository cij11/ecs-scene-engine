## Status
readyForDev

## Title
feat-ESE-0003-05: Implement query engine

## Description
Implement the query engine with all-of, none-of, and any-of modifiers. Queries return live result sets backed by a dense/sparse set, incrementally maintained on component add/remove. Deferred removal allows safe mutation during iteration.

## Acceptance Criteria
- defineQuery accepts component requirements with All, Not, Any modifiers
- Query results are a live dense/sparse set of matching entity IDs
- Adding a component updates all relevant queries incrementally
- Removing a component stages removal in a deferred buffer
- Deferred removals are committed at end of system or start of next query read
- Queries with identical signatures return the same cached result set
- Iterating a query is a direct loop over a packed array

## Testing Scenarios
- Query [Position, Velocity]: returns only entities with both
- Query [Position, Not(Frozen)]: excludes frozen entities
- Query [Any(DamageFlash, HealFlash)]: matches either
- Remove Position during iteration, verify entity remains until commit
- Define same query twice, verify same object reference

## Testing Notes
Unit tests in engine/ecs/query.test.ts

## Size
2

## Subtasks

## Started

## Completed

## Blockers
- feat-ESE-0003-03 (needs bitmask tracking for matching)

## Knowledge Gaps

## Comments
