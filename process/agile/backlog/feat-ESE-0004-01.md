## Status
inDevelopment

## Title
feat-ESE-0004-01: Slack Socket Mode listener for thread replies

## Description
A long-running Node.js process that connects to Slack via Socket Mode (WebSocket, no public URL required) and listens for message events in threads that originated from Claude Code notifications. When a reply is detected, it emits the reply content along with the thread_ts for downstream processing.

## Acceptance Criteria
- Connects to Slack via Socket Mode using an app-level token
- Listens for `message` events in threads
- Filters to only threads started by the Claude Code Notify bot
- Extracts reply text and thread_ts from incoming events
- Reconnects automatically if the WebSocket connection drops
- Runs as a background process via npm script
- Ignores bot's own messages to avoid loops

## Testing Scenarios
- User replies in a notification thread — listener receives the message
- User posts in a non-notification thread — listener ignores it
- WebSocket disconnects — listener reconnects automatically
- Listener is restarted — resumes listening without missing new messages
- Bot's own messages — ignored, no feedback loop

## Testing Notes

## Size
3

## Subtasks

## Team
unknown
## Started
2026-03-26T06:29:11.957Z
## Completed

## Blockers

## Knowledge Gaps
- Slack Socket Mode requires an app-level token (xapp-...) with `connections:write` scope
- Need `message.channels` and/or `message.groups` event subscriptions

## Comments
Socket Mode chosen over Events API because it requires no public URL — ideal for local development.
