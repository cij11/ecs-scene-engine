# Slack Notify

Claude Code hook that sends Slack notifications when an agent finishes or needs input. Supports threaded messages so each agent session gets its own conversation thread.

## Setup

### Option A: Bot token (recommended — enables threading)

1. Go to https://api.slack.com/apps and select your app (or create one)
2. Sidebar > **OAuth & Permissions**
3. Under **Bot Token Scopes**, add `chat:write`
4. Click **Install to Workspace** (or **Reinstall** if already installed)
5. Copy the **Bot User OAuth Token** (starts with `xoxb-...`)
6. Invite the bot to your channel: `/invite @YourBotName` in Slack
7. Get the channel ID: right-click the channel name > **View channel details** > copy the ID at the bottom

Add to `.claude/settings.local.json` (not committed to git):

```json
{
  "env": {
    "SLACK_BOT_TOKEN": "xoxb-your-token-here",
    "SLACK_CHANNEL": "C0123456789"
  }
}
```

### Option B: Webhook (simple — no threading)

1. Go to https://api.slack.com/apps and select your app
2. Sidebar > **Incoming Webhooks** > toggle **On**
3. **Add New Webhook to Workspace** > pick your channel
4. Copy the webhook URL

Add to `.claude/settings.local.json`:

```json
{
  "env": {
    "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
  }
}
```

### Verify

The hooks are already configured in `.claude/settings.json`. Once configured, notifications are sent automatically when:

- **Agent finishes** — a message with recent conversation context
- **Agent needs input** — a prompt to check your IDE

If no Slack env vars are set, the hook silently does nothing.

## How it works

The script is invoked by Claude Code hooks on `Stop` and `Notification` events. It:

1. Reads hook JSON from stdin
2. Parses the session transcript for recent conversation context
3. Formats a Slack Block Kit message with project name, session ID, and context
4. Posts to Slack via bot API or webhook

In bot token mode, each agent session's first notification creates a new message. Subsequent notifications for the same session reply in that message's thread. Thread state is stored in temp files (`$TMPDIR/claude-slack-threads/`).

Failures are swallowed silently so they never disrupt the agent session.
