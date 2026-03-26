## Status
done

## Title
feat-ESE-0002-01: Slack webhook notification on agent completion

## Description
Set up a Claude Code hook that fires when an agent session completes or is waiting for input, and sends a notification to a configured Slack incoming webhook. This is the foundational piece — get a message to Slack reliably.

## Acceptance Criteria
- A Claude Code hook triggers on session completion and on input-required events
- The hook sends a POST to a configured Slack incoming webhook URL
- The Slack message identifies the agent/task that completed
- Webhook URL is configured via a simple config file or environment variable
- If the webhook call fails, the error is logged locally without disrupting the agent session

## Testing Scenarios
- Agent completes — Slack notification arrives
- Agent awaits input — Slack notification arrives
- Webhook URL is invalid — local error logged, agent unaffected
- Webhook URL is not configured — hook is silently skipped

## Testing Notes

## Size
2

## Subtasks

## Started
2026-03-26T05:44:27.449Z
## Completed
2026-03-26T06:19:48.685Z
## Blockers

## Knowledge Gaps
- Which Claude Code hook events best correspond to "session complete" and "awaiting input"

## Comments
