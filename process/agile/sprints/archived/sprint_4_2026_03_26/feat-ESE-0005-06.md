## Status
done

## Title
feat-ESE-0005-06: Integrate view with browser entry point

## Description
Update browser/main.ts to initialise the Three.js renderer, create a World with entities that have Transform + SceneRef, register static scenes with visual nodes, and run a requestAnimationFrame game loop that ticks the ECS and syncs the view each frame.

## Acceptance Criteria
- browser/main.ts creates a World and registers a scene with NodeMesh
- Entities are instantiated with Transform + SceneRef
- requestAnimationFrame loop ticks the world and calls view sync
- Running `npm run dev` shows a rendered 3D object in the browser
- `npm run build` produces a working bundle

## Testing Scenarios
- `npm run dev` opens browser with visible 3D content
- Object moves when entity Transform is updated by a system

## Testing Notes
Manual verification via dev server.

## Size
1

## Subtasks

## Team
unknown
## Started
2026-03-26T07:58:26.621Z
## Completed
2026-03-26T07:59:47.624Z
## Blockers
- feat-ESE-0005-04 (need sync layer)
- feat-ESE-0005-05 (need node type handlers)

## Knowledge Gaps

## Comments
