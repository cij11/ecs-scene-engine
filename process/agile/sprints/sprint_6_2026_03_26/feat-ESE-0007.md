## Status
readyForDev

## Title
feat-ESE-0007: Validated demos that wow

## Description
Fix the toy-ship demo so it actually demonstrates the nested ECS architecture, and build the tooling and process to ensure demos are validated before presentation.

Three deliverables:
1. **Capture tooling** — headless screenshot capture via Playwright, with sampled frames for agent review
2. **Fixed toy-ship demo** — camera, lighting, and scene composition that clearly shows a ship orbiting with astronauts inside
3. **Validated demo process** — agent captures frames, reviews them against a visual spec, and only presents to stakeholder when it passes

Proof of success: the stakeholder sees the toy-ship demo and says "wow."

## Acceptance Criteria

### Capture tooling
- `npm run capture` produces a sequence of screenshots from the running game
- Sampled frames are saved for agent review
- Agent can read and evaluate sampled frames before presenting

### Toy-ship visual spec
The following must be clearly visible in captured frames:
- A ship (blue cube, visually larger) orbiting the origin — visible in ALL frames, never off screen
- 3 astronauts (green cubes, smaller) moving near/around the ship
- Astronauts track with the ship as it orbits (they move through space with it)
- Camera positioned to keep the full orbit path in view
- Lighting makes all objects clearly visible — no pure black faces, shadows give depth
- Background is distinct from objects

### Demo validation
- Agent captures frames, reviews at least 10 sampled frames
- Agent confirms each visual spec item passes before presenting to stakeholder
- If any item fails, agent fixes and re-captures — does not present a broken demo

## Testing Scenarios
- Capture 5s of gameplay, review sampled frames — all spec items visible
- Ship remains in frame across full orbit
- Astronauts are visibly distinct from ship (colour, size)
- Astronaut positions change between frames (they are moving)
- Ship position changes between frames (it is orbiting)

## Testing Notes
Headless WebGL via Playwright + SwiftShader. If SwiftShader doesn't render correctly, fall back to headed mode for capture.

## Size
Sum of subtasks

## Subtasks
- feat-ESE-0007-01: Fix headless rendering (SwiftShader/WebGL issues) (1pt)
- feat-ESE-0007-02: Fix camera, lighting, and scene composition (2pt)
- feat-ESE-0007-03: Agent-validated demo capture and review (1pt)

## Team

## Started

## Completed

## Blockers

## Knowledge Gaps
- SwiftShader may not support all WebGL features in headless mode
- May need headed Playwright as fallback for capture

## Comments
Sprint 5 shipped a broken demo. This ticket proves the process works by delivering a demo the stakeholder accepts.
