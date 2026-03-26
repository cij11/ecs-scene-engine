# Slack Integration for Claude Code

Two tools that create an asynchronous communication loop between Claude Code agents and Slack:

- **slack-notify** — Claude Code hook that sends notifications to Slack when an agent finishes or needs input
- **slack-listener** — long-running process that watches for your replies in Slack and resumes the agent session

Together, the flow is:

1. Agent works in VSCode
2. Agent finishes or needs input → notification appears in Slack
3. You read the context on your phone and reply in the Slack thread
4. The listener picks up your reply and resumes the agent session via `claude -r`
5. Agent continues working → sends another notification when done

---

## Part 1: Create a Slack App

All steps happen at https://api.slack.com/apps.

### 1.1 Create the app

1. Click **Create New App** > **From scratch**
2. **App Name**: enter a name (e.g. `Claude Code Notify`)
3. **Pick a workspace**: select your Slack workspace
4. Click **Create App**

You are now on the app's **Basic Information** page.

### 1.2 Add bot scopes

1. In the left sidebar, click **OAuth & Permissions**
2. Scroll down to the **Scopes** section
3. Under **Bot Token Scopes**, click **Add an OAuth Scope**
4. Add the scope: `chat:write`

### 1.3 Install to workspace

1. Scroll back up to the top of **OAuth & Permissions**
2. Click **Install to Workspace**
3. Review the permissions and click **Allow**
4. You are returned to the **OAuth & Permissions** page
5. **Copy the Bot User OAuth Token** — it starts with `xoxb-`
6. Save this somewhere safe. This is your `SLACK_BOT_TOKEN`.

### 1.4 Enable Incoming Webhooks (optional, for simple mode)

Only needed if you want the simpler webhook mode (no threading, no reply support).

1. In the left sidebar, click **Incoming Webhooks**
2. Toggle **Activate Incoming Webhooks** to **On**
3. Click **Add New Webhook to Workspace**
4. Select the channel where you want notifications
5. Click **Allow**
6. **Copy the Webhook URL** — it starts with `https://hooks.slack.com/services/`
7. This is your `SLACK_WEBHOOK_URL`.

### 1.5 Enable Socket Mode (required for reply support)

1. In the left sidebar, click **Socket Mode**
2. Toggle **Enable Socket Mode** to **On**
3. You are prompted to generate an app-level token
4. **Token Name**: enter a name (e.g. `socket-token`)
5. **Add Scope**: click **Add Scope** and select `connections:write`
6. Click **Generate**
7. **Copy the token** — it starts with `xapp-`
8. Save this somewhere safe. This is your `SLACK_APP_TOKEN`.
9. Click **Done**

### 1.6 Subscribe to events (required for reply support)

1. In the left sidebar, click **Event Subscriptions**
2. Toggle **Enable Events** to **On**
3. Scroll down to **Subscribe to bot events**
4. Click **Add Bot User Event** and add:
   - `message.channels` (detects messages in public channels)
   - `message.groups` (detects messages in private channels — add if your channel is private)
5. Click **Save Changes**
6. If prompted, click **Reinstall your app** and follow the prompts
7. After reinstalling, go back to **OAuth & Permissions** and **re-copy the Bot User OAuth Token** — it may have changed

### 1.7 Get your channel ID

1. In Slack, right-click the channel name where you want notifications
2. Click **View channel details**
3. Scroll to the bottom of the panel
4. **Copy the Channel ID** — it starts with `C`
5. This is your `SLACK_CHANNEL`.

### 1.8 Invite the bot to the channel

In the Slack channel, type:

```
/invite @Claude Code Notify
```

(Use whatever name you gave your app in step 1.1.)

---

## Part 2: Configure the project

All configuration goes in `.claude/settings.local.json` in your project root. This file is not committed to git.

### For bot mode with threading and reply support (recommended)

```json
{
  "env": {
    "SLACK_BOT_TOKEN": "xoxb-your-bot-token-here",
    "SLACK_CHANNEL": "C0123456789",
    "SLACK_APP_TOKEN": "xapp-your-app-level-token-here"
  }
}
```

You need all three values:

| Variable | Source | Looks like |
|----------|--------|------------|
| `SLACK_BOT_TOKEN` | OAuth & Permissions > Bot User OAuth Token | `xoxb-1234-5678-abcdef` |
| `SLACK_CHANNEL` | Channel details panel in Slack | `C0APBTU0GP3` |
| `SLACK_APP_TOKEN` | Socket Mode > app-level token | `xapp-1-A0ANS...-abcdef` |

### For webhook mode (simple, no threading or replies)

```json
{
  "env": {
    "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/T00/B00/xxxx"
  }
}
```

If both `SLACK_BOT_TOKEN`/`SLACK_CHANNEL` and `SLACK_WEBHOOK_URL` are set, bot mode takes priority.

---

## Part 3: Notifications (slack-notify)

Notifications work automatically once configured — no extra steps needed.

The hooks are already wired in `.claude/settings.json`:
- **`Stop` hook** — fires when an agent finishes responding
- **`Notification` hook** — fires when an agent needs user input

Each notification includes:
- Project name and session ID
- Recent conversation context (extracted from the session transcript)

In bot mode, each agent session gets its own Slack thread. Subsequent notifications from the same session reply in the same thread.

### Testing notifications

Send a test notification manually:

```bash
echo '{"hook_event_name":"Stop","session_id":"test-001","cwd":"'$(pwd)'","last_assistant_message":"Test notification."}' \
  | npm run --workspace=slack-notify notify
```

---

## Part 4: Replies (slack-listener)

The listener is a separate long-running process that watches for your replies in Slack notification threads.

### Start the listener

```bash
npm run --workspace=slack-listener start
```

Keep this running in a dedicated terminal tab. When you reply to a notification thread in Slack, the listener will:

1. Detect the reply
2. Look up which Claude Code session sent the original notification
3. Resume that session with your reply via `claude -r <session_id> -p "your message"`
4. The resumed session runs, completes, and sends a new notification

### Stopping the listener

Press `Ctrl+C` in the terminal, or kill the process.

---

## Limitations

- **Resumed sessions run as a new CLI process**, not in the original VSCode panel. The conversation context carries over, but you won't see it in VSCode.
- **Thread state is stored in temp files** (`$TMPDIR/claude-slack-threads/`). A reboot clears these, breaking the thread-to-session mapping for older notifications.
- **One reply at a time per session** — if you send multiple replies before the agent finishes, only the first is processed.
- **Slack message size limit** — conversation context is truncated to ~3800 characters.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| No notification in Slack | Env vars not set | Check `.claude/settings.local.json` has the correct variables |
| `missing_scope` error | Bot token missing `chat:write` | Add the scope in OAuth & Permissions, reinstall app, copy new token |
| `not_in_channel` error | Bot not invited | Type `/invite @BotName` in the channel |
| Listener connected but no replies detected | Event subscriptions missing | Add `message.channels` in Event Subscriptions, save, reinstall |
| `ENOENT` when resuming | `claude` not found | Run `npm install` in the project root to install the dependency |
| Notifications work but no threading | Using webhook mode | Switch to bot token mode (add `SLACK_BOT_TOKEN` and `SLACK_CHANNEL`) |
