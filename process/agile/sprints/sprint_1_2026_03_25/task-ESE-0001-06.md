## Status
readyForDev

## Title
task-ESE-0001-06: Define view layer and rendering integration

## Description
Define the view layer. The view is completely agnostic to the ECS engine. The engine emits state; the view reads it and renders. Define how view/ connects to engine output and to browser/.

## Acceptance Criteria
- View layer responsibilities are documented (what it does and doesn't do)
- Interface between engine state and view is defined
- How view/ connects to browser/ (DOM, canvas) is documented
- Rendering technology choices are deferred but the abstraction boundary is clear
- Documented in docs/

## Testing Scenarios
- A developer can read the doc and implement a new renderer without touching engine code

## Testing Notes
Documentation ticket. Validation by review.

## Size
1

## Subtasks

## Started

## Completed

## Blockers
- task-ESE-0001-04 (need engine API surface to define the interface)

## Knowledge Gaps

## Comments
