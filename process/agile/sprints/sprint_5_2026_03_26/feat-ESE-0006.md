## Status
done

## Title
feat-ESE-0006: Space toy problem — nested ECS with ship and astronauts

## Description
Build an MVP toy problem demonstrating nested ECS worlds with rendering. A space scene contains a ship that orbits. The ship has an interior scene with its own ECS where astronauts move around. Both ECS worlds tick (root-to-leaf) and both render via the view sync layer.

This exercises:
- Scene instantiation (node trees → ECS entities)
- Nested ECS worlds (NodeECS creating child Worlds)
- Root-to-leaf tick ordering
- Transform propagation (interior entities positioned relative to ship)
- View sync across multiple worlds
- Core components (Transform, Velocity) and core systems (movement)

Game-specific systems and components live in `game/toy-ship/`. Generic, reusable components (Transform, Velocity) and systems (movement) live in `engine/ecs/components/` and `engine/ecs/systems/`.

No inter-ECS communication (ports) in this pass — astronauts stay inside the ship.

## Acceptance Criteria
- Space ECS world contains a ship entity that orbits the origin
- Ship entity has a child NodeECS that creates a ship interior world
- Ship interior ECS contains astronaut entities that move around
- Both worlds tick each frame, space first, then interior
- Both worlds render — ship mesh visible in space, astronauts visible inside
- Interior entity transforms are offset by the ship's world-space transform
- Transform component moved from view/ to engine/core-components/
- Velocity core component added
- Movement core system applies velocity to transform
- Running `npm run dev` shows the ship orbiting with astronauts moving inside

## Testing Scenarios
- Space world ticks before interior world
- Ship entity moves each frame (orbit system)
- Astronaut entities move within interior (movement system)
- View renders objects from both worlds
- Interior transforms are in world space (ship position + local offset)

## Testing Notes
Unit tests for scene instantiation, nested world ticking, transform propagation. Visual verification via dev server.

## Size
Sum of subtasks (10)

## Subtasks
- feat-ESE-0006-01: Move Transform to engine/ecs/components, add Velocity component (1pt)
- feat-ESE-0006-02: Implement movement core system (1pt)
- feat-ESE-0006-03: Implement scene instantiation (node tree → ECS entities) (2pt)
- feat-ESE-0006-04: Implement nested ECS worlds (NodeECS, root-to-leaf ticking) (2pt)
- feat-ESE-0006-05: Implement transform propagation (child world → parent offset) (1pt)
- feat-ESE-0006-06: Update view sync to render multiple worlds (1pt)
- feat-ESE-0006-07: Build toy problem scenes and wire up in browser (2pt)

## Team
unknown
## Started
2026-03-26T08:13:42.208Z
## Completed
2026-03-26T08:22:28.220Z
## Blockers
- feat-ESE-0003 (ECS core — done)
- feat-ESE-0005 (view architecture — done)

## Knowledge Gaps
- Best representation for nested world hierarchy at runtime
- How to cleanly pass parent transform to child world sync

## Comments
Pass 1 of the spaceship toy problem. Pass 2 will add inter-ECS communication (ports) for astronaut enter/leave.
