## Status
readyForDev

## Title
feat-ESE-0004-02: Thread-to-session mapping and CLI resume invocation

## Description
When the Slack listener receives a thread reply, map the thread back to the originating Claude Code session and invoke `claude -r <session_id> -p "message"` in the correct project directory. The existing slack-notify tool stores session_id → thread_ts mappings; this subtask adds the reverse lookup and the resume invocation.

## Acceptance Criteria
- Thread-to-session state files support bidirectional lookup (thread_ts → session_id and project directory)
- The slack-notify tool is updated to store project directory alongside session_id and thread_ts
- When a Slack reply is received, the correct session_id and working directory are resolved
- `claude -r <session_id> -p "message"` is spawned in the correct working directory
- If the session ID is invalid or expired, an error message is posted back to the Slack thread
- The resumed session's Stop hook fires normally, sending a new notification to the same thread

## Testing Scenarios
- Reply received → correct session resumes in correct directory → new notification in same thread
- Reply to an expired session → error posted back to Slack
- Reply with special characters or long text → handled correctly
- Multiple replies before agent finishes → only first is processed, or queued sequentially
- State file is missing or corrupted → graceful error

## Testing Notes

## Size
3

## Subtasks

## Team
unknown
## Started
2026-03-26T06:29:13.096Z
## Completed

## Blockers
- feat-ESE-0004-01 must be complete (listener provides the reply events)

## Knowledge Gaps
- Whether `claude -r` inherits hooks from the project's `.claude/settings.json` when run from the correct cwd
- Session transcript file location pattern for resolving session validity

## Comments
The state file format will change from a simple txt file (session_id → thread_ts) to a JSON file containing session_id, thread_ts, and cwd. This is a breaking change to the current slack-notify state files.
