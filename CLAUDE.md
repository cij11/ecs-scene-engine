# Project Instructions

## Collaboration & Locks

This project uses a file-based locking system for coordinating work across multiple developers and agents. The full process is documented in `process/collaboration/collaboration.md`.

**Before reading files:** Check `process/collaboration/locks/` for active locks covering the files you intend to read. If locked, note that those files may change under you.

**Before writing files:** Create a lock file in `process/collaboration/locks/` identifying yourself, the files/directories you are locking, and when you expect to release. See `process/collaboration/collaboration.md` for the format.

**After writing files:** Remove your lock file from `process/collaboration/locks/`.

## Ticket Status Changes

**NEVER manually edit `process/agile/sprints/ticketStatus.json`.** This file is the authoritative source of ticket status and may ONLY be written by the automation script.

**NEVER manually edit a ticket's `## Status` field.** All status transitions must go through:

```
npm run ticket:status -- <ticket> <new_status>
```

This script enforces gates (CI, field validation, demo checks), updates ticketStatus.json, and writes to the audit log. Manual edits will be detected by `npm run ticket:validate` and flagged as violations.

## Code Review

**NEVER create a review.md file without having actually reviewed the code.** When a ticket is in `inReview` status, you must:

1. Read the changed/created source files
2. Check them against the ticket's acceptance criteria
3. Assess code quality, correctness, and test coverage
4. Only then write review.md with your findings

review.md must contain an honest assessment. If there are critical or severe issues, they must be listed — do not create a clean review.md to bypass the gate.

## Testing Strategy

**Programmatic tests are the fence at the top of the cliff. Visual tests are the ambulance at the bottom.**

During development, validate programmatically first:
- Write unit tests for low-level functions
- Emit logging for complex scenarios, with asserts to validate
- Only when the data indicates success, move on to visual testing

Visual testing is the primary mechanism for **demo validation**, not dev validation. Don't rely on screenshots to debug rendering issues — use console logging, entity counts, position asserts, and query results first. Use visual checks to get perspective or get out of a rut, but don't depend on them as the primary development tool.

## Agile Process

See `process/agile/agile.md` for the full process. Key points:

- Tickets follow the status flow defined in agile.md
- `feat` tickets require a Demo Deliverable and must go through the demo validation process
- All transitions are gated by the automation scripts
- CI must pass before marking tickets done (`npm run ci`)
