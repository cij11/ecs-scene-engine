## Status
done

## Title
feat-ESE-0003-03: Implement bitmask component membership tracking

## Description
Implement bitmask-based component membership. Each component schema is assigned a bit position. Membership checks are a single bitwise AND. Supports overflow to multiple generations when more than 31 components are registered.

## Acceptance Criteria
- Each registered component gets a unique bit position
- entityMasks tracks which components each entity has
- hasComponent is a single bitwise AND operation
- addComponent/removeComponent update the bitmask
- Supports more than 31 components via generation overflow

## Testing Scenarios
- Register 5 components, add 3 to an entity, verify bitmask
- Register 40 components (forces multi-generation), verify correct tracking
- Remove a component, verify bit is cleared

## Testing Notes
Unit tests in engine/ecs/component.test.ts

## Size
1

## Subtasks

## Started
2026-03-26T05:54:56.117Z
## Completed
2026-03-26T05:55:54.023Z
## Blockers
- feat-ESE-0003-02 (needs component definitions)

## Knowledge Gaps

## Comments
