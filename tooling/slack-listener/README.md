# Slack Listener

Listens for replies in Slack notification threads (sent by `slack-notify`) and resumes the corresponding Claude Code session via `claude -r`.

## Setup

### Prerequisites

- The `slack-notify` bot token setup must be complete (see `tooling/slack-notify/README.md`)
- `claude` CLI must be available on PATH

### 1. Enable Socket Mode

1. Go to https://api.slack.com/apps and select your app
2. Sidebar > **Socket Mode** > toggle **On**
3. Generate an **app-level token** with `connections:write` scope
4. Copy the token (starts with `xapp-...`)

### 2. Subscribe to events

1. Sidebar > **Event Subscriptions** > toggle **On**
2. Under **Subscribe to bot events**, add:
   - `message.channels` (for public channels)
   - `message.groups` (for private channels, if needed)
3. Click **Save Changes**
4. Reinstall the app if prompted

### 3. Configure env vars

Add to `.claude/settings.local.json`:

```json
{
  "env": {
    "SLACK_APP_TOKEN": "xapp-your-app-level-token",
    "SLACK_BOT_TOKEN": "xoxb-your-bot-token",
    "SLACK_CHANNEL": "C0123456789"
  }
}
```

### 4. Run the listener

```bash
npm run --workspace=slack-listener start
```

The listener runs as a long-lived process. Keep it running in a terminal tab or use a process manager.

## How it works

1. Connects to Slack via Socket Mode (WebSocket, no public URL needed)
2. Watches for message events in threads within the configured channel
3. When a reply is detected, looks up the thread in the shared state directory (`$TMPDIR/claude-slack-threads/`)
4. Resolves the originating Claude Code session ID and project directory
5. Spawns `claude -r <session_id> -p "message"` in the correct directory
6. The resumed session's Stop hook sends a new Slack notification when done

## Limitations

- Resuming via CLI creates a new process, not the original VSCode session
- Only one reply is processed at a time per session (concurrent replies are skipped)
- Session state is stored in temp files and may be lost on reboot
