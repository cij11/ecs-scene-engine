## Status
readyForDev

## Title
feat-ESE-0003-08: Export public API from engine/index.ts

## Description
Create the engine barrel export that exposes all public ECS API for consumption by game/, view/, and browser/.

## Acceptance Criteria
- engine/index.ts exports all public types and functions per docs/engine-module-structure.md
- Internal modules are not exported
- Consumers can import everything from a single path

## Testing Scenarios
- Import from engine/index.ts, verify all documented API is accessible

## Testing Notes
Smoke test in engine/index.test.ts

## Size
1

## Subtasks

## Started

## Completed

## Blockers
- feat-ESE-0003-07 (needs all modules to exist)

## Knowledge Gaps

## Comments
