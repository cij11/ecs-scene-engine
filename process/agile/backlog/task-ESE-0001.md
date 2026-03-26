## Status
refining

## Title
task-ESE-0001: Architect project

## Description
Define the architecture for the ECS scene engine. Establish the core abstractions, module boundaries, and data flow between engine, game, and browser layers. Document decisions in docs/ so future work has a clear foundation.

## Acceptance Criteria
- Engine core architecture is documented (ECS model, world, entities, components, systems)
- Module boundaries are defined (what lives in engine/ vs game/ vs browser/)
- Data flow is documented (how the game loop runs, how systems are scheduled, how rendering connects to the browser)
- Build and entry point strategy is defined (how browser/ mounts and starts the engine)
- Key technology choices are documented (rendering approach, bundler, test framework)
- Architecture docs are committed to docs/

## Testing Scenarios
- A reviewer can read the architecture docs and understand where to add a new component, system, or game feature
- The documented module boundaries are consistent with the existing directory structure

## Testing Notes
This is a documentation/design ticket. Validation is by review rather than automated tests.

## Size
Sum of subtasks (6)

## Subtasks
- task-ESE-0001-01: Define ECS core abstractions (1pt)
- task-ESE-0001-02: Define engine module structure and public API surface (1pt)
- task-ESE-0001-03: Define game module structure (1pt)
- task-ESE-0001-04: Define browser entry point and rendering integration (1pt)
- task-ESE-0001-05: Choose build tooling and test framework (1pt)
- task-ESE-0001-06: Write architecture docs (1pt)

## Started

## Completed

## Blockers

## Knowledge Gaps
- Rendering approach: Canvas 2D, WebGL, or WebGPU?
- Networking: will multiplayer be part of the engine or a separate layer?
- Scene management: how do scenes/levels compose with the ECS?

## Comments
