## Status
done

## Title
task-ESE-0001-07: Define serialisation layer

## Description
Define the serialisation layer that sits between the engine and both the networking layer and persistence. The engine emits and receives signals via this layer. The same serialisation format serves both multiplayer networking and game state save/load.

## Acceptance Criteria
- Serialisation interface is defined (what gets serialised, format)
- How the engine emits signals to the serialisation layer is documented
- How the serialisation layer feeds back into the engine is documented
- Shared use by networking and persistence is documented
- Documented in docs/

## Testing Scenarios
- A developer can read the doc and understand how to serialise a scene's state
- A developer can understand how a network message flows in and out of the engine

## Testing Notes
Documentation ticket. Validation by review.

## Size
1

## Subtasks

## Started
2026-03-26T05:33:37.252Z
## Completed
2026-03-26T05:34:15.052Z
## Blockers
- task-ESE-0001-04 (need engine API surface)

## Knowledge Gaps

## Comments
Reference: references/colyseus/ for networking patterns
