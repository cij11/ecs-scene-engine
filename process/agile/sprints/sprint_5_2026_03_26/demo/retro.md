# Sprint 5 Retrospective

## What went wrong

The demo was marked complete and presented without visual validation. The rendered output showed:
- Ship orbiting off screen
- No astronauts visible
- Oblique camera angle that didn't show the feature

Tests passed and the build succeeded, but nobody actually looked at what was rendering before calling it done.

## Root cause

- Definition of Done did not require visual verification
- Demo was created after sprint completion, as an afterthought
- No validation step between "code works" and "demo is ready"
- The developer (Claude) ran automated checks but never verified the visual output

## Process changes made

1. **Definition of Done** updated — tickets with visual output now require screenshot capture and visual verification
2. **Definition of Ready** updated — visual tickets must describe what should be visible, not just "it renders"
3. **Sprint completion process** updated — added Validate and Acceptance steps before Close
4. **Demo cannot be presented without developer self-validation first**
5. **Sprint cannot be closed until stakeholder accepts the demo**
