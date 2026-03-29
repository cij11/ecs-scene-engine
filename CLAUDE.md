# Project Instructions

## Collaboration & Locks

This project uses a file-based locking system for coordinating work across multiple developers and agents. The full process is documented in `process/collaboration/collaboration.md`.

**Before reading files:** Check `process/collaboration/locks/` for active locks covering the files you intend to read. If locked, note that those files may change under you.

**Before writing files:** Create a lock file in `process/collaboration/locks/` identifying yourself, the files/directories you are locking, and when you expect to release. See `process/collaboration/collaboration.md` for the format.

**After writing files:** Remove your lock file from `process/collaboration/locks/`.

## Stories

Work is organised as **Storybook stories**. Each story is an interface between two agents in a chain of command.

- **Top-level stories** = human:agent interface (top-level goals)
- **Substories** = agent:sub-agent interface (delegated subgoals)
- Stories live in `stories/NNNN/` with substories in `stories/NNNN/NNNN/`
- 4-digit zero-padded numbering for sorting
- Each story has: `goal` (what it achieves) and `status` (refining/dev/review/done)

When a task is too complex for one agent, create substories and delegate to sub-agents. Sub-agents can work in parallel.

## Review

All stories require review before done:

1. **Code review** — read the code, check against the story goal, assess quality
2. **Test output** — tests must pass, results captured
3. **Visual review** — for anything human-facing, screenshots reviewed by a context-free sub-agent with no source code access

Never create a review without actually reviewing. Never rubber-stamp.

## Testing Strategy

**Programmatic tests are the fence at the top of the cliff. Visual tests are the ambulance at the bottom.**

During development, validate programmatically first:
- Write unit tests for low-level functions
- Emit logging for complex scenarios, with asserts to validate
- Only when the data indicates success, move on to visual testing

Visual testing validates **human-facing output**, not internal logic.

## CI

CI must pass: `npm run ci` (prettier + eslint + typecheck + vitest)
