## Status

inDevelopment

## Title

feat-ESE-0005: Fix toy-ship demo

## Description

Fix the toy-ship demo so it clearly demonstrates nested ECS with transform propagation. The demo is served as a webpage to localhost. A top-down camera shows a ship orbiting a sun, with three astronauts inside the ship maintaining their relative transforms as the ship moves and rotates.

## Acceptance Criteria

- Top-down camera view, looking straight down at the scene
- A yellow sphere ("sun") at the centre of the view, stationary
- A blue box ("ship") orbiting the sun — visible in ALL frames, never leaves the viewport
- 3 green arrows ("astronauts") inside/near the ship:
  - Astronaut 1: translates along the ship's local X axis (-1 to +1)
  - Astronaut 2: translates along the ship's local Y axis (-1 to +1)
  - Astronaut 3: translates along the ship's local Z axis (-1 to +1)
  - Each arrow points in the +ve direction of its axis, relative to the ship
- Astronaut positions and rotations are relative to the ship — as the ship orbits and rotates, the astronauts move and rotate with it
- Lighting makes all objects clearly visible
- Demo runs at localhost:3000 via `npm run dev`

## Demo Deliverable

A 1-second video (series of screenshots at 30fps) of the running demo. The video must show:

- The sun stationary at centre
- The ship completing a visible portion of its orbit around the sun
- The three astronauts oscillating along their respective axes, visibly attached to and rotating with the ship
- All objects visible in every frame

An independent agent reviewing only the screenshots must be able to identify: a central yellow sphere, a blue box orbiting it, and three green arrow shapes moving with the blue box.

## Testing Scenarios

- Ship remains in viewport across full orbit
- Sun is stationary at centre
- Astronaut X-axis entity oscillates along ship's local X
- Astronaut Y-axis entity oscillates along ship's local Y
- Astronaut Z-axis entity oscillates along ship's local Z
- Astronaut arrows rotate with the ship
- All objects lit and visible against background

## Testing Notes

Headless capture via Playwright. Agent reviews sampled frames against demo deliverable. Manual verification via dev server.

## Size

3

## Subtasks

## Stakeholder Understanding

Stakeholder described: A top-down view of a blue ship orbiting a yellow sun at centre. Three green arrows (astronauts) oscillate along each cardinal axis relative to the ship. Arrows are aligned in the +ve direction of their axis. Astronauts maintain position and rotation relative to the ship as it orbits. The demo must be servable to localhost and captured as a screenshot sequence for agent review.

## Demo Accepted

Yes

## Team

unknown

## Started

2026-03-26T10:15:30.535Z

## Completed
2026-03-26T11:57:50.805Z
## Blockers

## Knowledge Gaps

- Arrow geometry in Three.js (ConeGeometry or custom)
- Headless WebGL rendering via Playwright/SwiftShader — previous attempt showed "Unknown scene: sphere"

## Comments

Previous demo (sprint 5) failed: ship flew off screen, no astronauts visible, camera angle wrong. This ticket fixes all visual issues and validates via the new demo process.
