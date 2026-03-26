## Status
readyForDev

## Title
feat-ESE-0002-03: Slack bot for responding back to agent sessions

## Description
Enable bidirectional communication by allowing the user to reply to a Slack notification thread and have that response fed back into the waiting Claude Code agent session. File upload support is a future extension.

## Acceptance Criteria
- A Slack bot/app listens for replies in notification threads
- Replies are routed back to the correct Claude Code agent session
- The agent resumes with the user's response as input
- The system handles the case where the agent session has expired or been closed

## Testing Scenarios
- User replies in Slack thread — agent receives the response and resumes
- User replies to an expired session — informative error message in Slack
- Multiple agents awaiting input — replies are routed to the correct session
- Bot is offline — replies are queued or user is informed

## Testing Notes

## Size
5

## Subtasks

## Started

## Completed

## Blockers
- feat-ESE-0002-01 and feat-ESE-0002-02 should be completed first

## Knowledge Gaps
- Mechanism for feeding external input back into a Claude Code session
- Whether Claude Code supports resuming a paused/waiting session programmatically
- Slack app setup requirements (bot token, event subscriptions, OAuth scopes)

## Comments
File upload support (attaching files from Slack to the agent session) is an identified extension but out of scope for this subtask.
