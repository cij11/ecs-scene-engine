## Status
readyForDev

## Title
feat-ESE-0002-02: Conversation context extraction and formatting

## Description
Extract the relevant conversation context from a Claude Code session (since the last notification) and format it for inclusion in the Slack message. The message should give the recipient enough context to understand what happened without needing to open VSCode.

## Acceptance Criteria
- Conversation context since the last notification is extracted from the Claude Code session
- Context is formatted as readable Slack markdown (mrkdwn)
- Large contexts are truncated or paginated to stay within Slack message limits (4000 chars per block, ~50 blocks per message)
- The formatted message includes: agent identifier, task summary, and conversation content

## Testing Scenarios
- Short conversation — full context included in message
- Long conversation — context is truncated with an indication that it was truncated
- Conversation with code blocks — code is preserved in Slack code formatting
- Multiple notifications from same session — each contains only the delta since the last notification

## Testing Notes

## Size
3

## Subtasks

## Started

## Completed

## Blockers

## Knowledge Gaps
- How to access Claude Code conversation history programmatically from a hook
- Whether conversation state is available via files, API, or environment variables

## Comments
