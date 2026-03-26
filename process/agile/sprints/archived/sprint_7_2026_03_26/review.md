# Code Review: feat-ESE-0005 — Fix toy-ship demo

## Resolved Issues

1. **[RESOLVED] Module-level mutable state in systems.ts** — Fixed: WeakMap per-world state replaces module globals.
2. **[RESOLVED] Scale overwrite bug** — Fixed: baseScale stored at creation, multiplied with ECS scale in updateTransform.
3. **[RESOLVED] GPU memory leak on arrow removal** — Fixed: removeObject traverses Group children and disposes meshes.
4. **[RESOLVED] Hardcoded entity indices** — Fixed: createOrbitSystem factory accepts entity index explicitly.

## Remaining Moderate Issues (follow-up backlog tickets)

5. Y-axis astronaut oscillation invisible from top-down camera (partially addressed by XZ offset).
6. Orthographic frustum not aspect-aware — hardcoded bounds.
7. `zoom` param declared but never applied to OrthographicCamera.
8. Missing test coverage for child-world transform composition.

## Remaining Process Issues

9. **Playwright capture causes viewport flashing/resize** — This prevented the agent from being able to visually validate fixes. The capture tool resizes the viewport during screenshot, causing the Three.js renderer to flash and distort. This is a process blocker for visual validation and must be addressed before capture-based demo validation can be trusted. (Follow-up ticket required.)

## Remaining Minor Issues

10. Capture tooling header comment says localhost:3000, code defaults to 4000.
11. Unused `body` node in astronautScene.
12. `resize` doesn't update OrthographicCamera frustum.

## Verdict

**Ready to proceed to inTesting.** No blocking issues remain. Moderate and minor issues to be addressed in follow-up tickets.
