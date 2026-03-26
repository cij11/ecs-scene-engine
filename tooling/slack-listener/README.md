# Slack Listener

Watches for replies in Slack notification threads and resumes the corresponding Claude Code session.

This is part of the Slack integration for Claude Code. For full setup instructions including Slack app creation, see [tooling/slack-notify/README.md](../slack-notify/README.md).

## Quick start

Requires the bot token setup to be complete (Parts 1-3 of the main guide).

```bash
npm run --workspace=slack-listener start
```

## How it works

1. Connects to Slack via Socket Mode (WebSocket, no public URL needed)
2. Watches for message events in threads within the configured channel
3. When a reply is detected, looks up the thread in the shared state directory (`$TMPDIR/claude-slack-threads/`)
4. Resolves the originating Claude Code session ID and project directory
5. Spawns `claude -r <session_id> -p "message"` in the correct directory
6. The resumed session's Stop hook sends a new Slack notification when done
