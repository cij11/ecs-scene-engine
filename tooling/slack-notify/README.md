# Slack Notify

Claude Code hook that sends Slack notifications when an agent finishes or needs input.

## Setup

### 1. Create a Slack App

1. Go to https://api.slack.com/apps
2. Click **Create New App** > **From scratch**
3. Name it (e.g. "Claude Code Notify"), select your workspace
4. In the sidebar, click **Incoming Webhooks** > toggle **On**
5. Click **Add New Webhook to Workspace**
6. Select the channel or DM where you want notifications
7. Copy the webhook URL (starts with `https://hooks.slack.com/services/...`)

### 2. Configure the webhook URL

Add the URL to `.claude/settings.local.json` (not committed to git):

```json
{
  "env": {
    "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
  }
}
```

### 3. Verify

The hooks are already configured in `.claude/settings.json`. Once the webhook URL is set, notifications will be sent automatically when:

- **Agent finishes** — you'll see a message with the recent conversation context
- **Agent needs input** — you'll get a prompt to check your IDE

If `SLACK_WEBHOOK_URL` is not set, the hook silently does nothing.

## How it works

The script is invoked by Claude Code hooks on `Stop` and `Notification` events. It:

1. Reads hook JSON from stdin
2. Parses the session transcript for recent conversation context
3. Formats a Slack Block Kit message with project name, session ID, and context
4. POSTs to the configured webhook URL

Failures are swallowed silently so they never disrupt the agent session.
