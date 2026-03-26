## Status
refining

## Title
task-ESE-0001: Architect project

## Description
Define the architecture for the ECS scene engine. The engine follows a Godot-inspired scene tree architecture where everything is a scene, and each scene is a world with its own ECS.

Key architectural principles:
- **Scene tree**: A game is composed of scenes. Each scene is a world with its own ECS. Scenes signal up to parents/siblings and call down to children.
- **Lazy ECS**: While everything is a scene, ECS simulation only runs on entities that have game logic. Static scenes (e.g. a TextLabel, or a sleeping entity) do not run an ECS tick.
- **Rendering agnostic**: The view layer is completely decoupled from the ECS engine. The engine emits state; the view reads and renders it.
- **Networking agnostic**: The engine emits and receives signals to/from the networking layer via a serialisation layer. This same serialisation layer can be used for persisting game state.

## Acceptance Criteria
- Scene tree architecture is documented (scenes as worlds, signal up / call down)
- ECS core abstractions are documented (World, Entity, Component, System)
- Lazy ECS strategy is documented (when ECS ticks, when it doesn't)
- Module boundaries are defined (engine/ vs game/ vs view/ vs browser/)
- Serialisation layer interface is defined (shared by networking and persistence)
- Build and entry point strategy is defined
- Key technology choices are documented
- Architecture docs are committed to docs/

## Testing Scenarios
- A reviewer can read the docs and understand the scene tree model
- A reviewer can trace how a signal flows up from a child scene to a parent
- A reviewer can understand when ECS runs and when it doesn't
- The documented module boundaries are consistent with the directory structure

## Testing Notes
This is a documentation/design ticket. Validation is by review rather than automated tests.

## Size
Sum of subtasks (8)

## Subtasks
- task-ESE-0001-01: Define ECS core abstractions (1pt)
- task-ESE-0001-02: Define scene tree architecture (1pt)
- task-ESE-0001-03: Define lazy ECS strategy (1pt)
- task-ESE-0001-04: Define engine module structure and public API surface (1pt)
- task-ESE-0001-05: Define game module structure (1pt)
- task-ESE-0001-06: Define view layer and rendering integration (1pt)
- task-ESE-0001-07: Define serialisation layer (networking + persistence) (1pt)
- task-ESE-0001-08: Choose build tooling and test framework (1pt)

## Started

## Completed

## Blockers

## Knowledge Gaps

## Comments
Architecture inspired by Godot's scene tree. Reference: references/godot/
