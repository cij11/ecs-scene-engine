# Sprint 7 Retrospective

## What went well

1. **Gate system caught real problems.** The review gate forced a code review that found the entity handle collision bug, scale overwrite bug, and module-global state. Without gates, these would have shipped broken — exactly like sprint 5. The process worked as designed.

2. **Programmatic debugging over visual debugging.** Console logging via Playwright revealed the root cause (3 render handles instead of 8, 0 cameras) faster than iterating on screenshots. Entity count logs pointed directly to the per-world state collision.

3. **Independent agent demo validation.** The validator agent reviewed screenshots without source code access, confirmed all 7 questions, and proved the demo process works end-to-end.

## What needs improvement

1. **Ticket file format fragility.** Blank lines between section headers and values broke multiple scripts. Every script has its own regex for parsing markdown. Need a single robust format — addressed by task-ESE-0007.

2. **Status split caused confusion.** Status in both ticketStatus.json and the ticket file created a dual source of truth. Sprint closed with 0 completed points despite the ticket being done. Addressed by task-ESE-0007.

3. **Too many cycles before first visual check.** The entity handle collision should have been caught in a unit test before building the browser demo. Following "programmatic first, visual to validate" earlier would have saved several capture-debug-fix cycles. Addressed by task-ESE-0008.

## Actions taken

- Created task-ESE-0006: Build sprint service (consolidate scattered scripts)
- Created task-ESE-0007: Single source of truth for ticket state
- Created task-ESE-0008: Architecture spike before implementation tickets
- Updated CLAUDE.md with testing strategy guidance
- Fixed Playwright capture flashing issue
- Added per-world sync state to prevent entity handle collisions

## Sprint metrics

- Ticket: feat-ESE-0005 (Fix toy-ship demo)
- Size: 3 story points
- Demo: Accepted by stakeholder
- Velocity data inaccurate due to status split bug (reported 0 instead of 3)
