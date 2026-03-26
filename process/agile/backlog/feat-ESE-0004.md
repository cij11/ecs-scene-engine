## Status
refining

## Title
feat-ESE-0004: Slack to Claude Code response integration

## Description
When a Claude Code agent sends a Slack notification (via feat-ESE-0002), the user should be able to reply in the Slack thread and have that reply fed back into the agent's session. The reply is picked up by a Slack listener and forwarded to the session via `claude -r <session_id> -p "message"`. The agent then continues its work and sends another Slack notification when done.

This creates a full asynchronous loop: agent works → notifies → user replies from phone → agent resumes → notifies again.

A future iteration will replace the CLI resume with MCP Channels when that feature stabilises.

## Acceptance Criteria
- A Slack listener process watches for replies in notification threads
- Replies are mapped to the correct Claude Code session via thread-to-session-id mapping
- The listener invokes `claude -r <session_id> -p "message"` in the correct project directory
- The resumed session sends a Slack notification when it completes (existing Stop hook)
- The listener handles multiple concurrent sessions across multiple projects
- The listener fails gracefully if a session ID is invalid or expired

## Testing Scenarios
- User replies in Slack thread → agent resumes and completes work → new Slack notification sent
- User replies to an expired/invalid session → informative error posted back to Slack thread
- Multiple agents finish concurrently, user replies to each → correct sessions resume
- Listener process crashes and restarts → picks up where it left off without duplicating work
- User replies multiple times before agent finishes → replies are queued or only latest is used

## Testing Notes

## Size
5

## Subtasks
- feat-ESE-0004-01: Slack Socket Mode listener for thread replies
- feat-ESE-0004-02: Thread-to-session mapping and CLI resume invocation

## Team

## Started

## Completed

## Blockers

## Knowledge Gaps
- Slack Socket Mode setup requirements (app-level token, event subscriptions)
- Whether `claude -r` preserves hooks from the original session's project settings
- How to determine the correct working directory for a session from its ID

## Comments
Supersedes feat-ESE-0002-03 (Slack bot for responding back to agent sessions), which was scoped around bidirectional Slack bot communication. This ticket takes the simpler CLI resume approach instead.

The existing thread-to-session mapping (stored in $TMPDIR/claude-slack-threads/) maps session_id → thread_ts. This ticket needs the reverse mapping (thread_ts → session_id), so the state files will need to support bidirectional lookup.
