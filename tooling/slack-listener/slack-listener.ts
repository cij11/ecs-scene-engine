/**
 * Slack Socket Mode listener for Claude Code.
 * Watches for thread replies on notifications sent by slack-notify,
 * resolves the originating session, and resumes it via `claude -r`.
 *
 * Required env vars:
 *   SLACK_APP_TOKEN  - app-level token (xapp-...) with connections:write
 *   SLACK_BOT_TOKEN  - bot token (xoxb-...) for posting error messages
 *   SLACK_CHANNEL    - channel ID to listen in
 */

import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import { getStateByThread, type ThreadState } from "./thread-state.js";

const require = createRequire(import.meta.url);
const CLAUDE_BIN = path.join(
  path.dirname(require.resolve("@anthropic-ai/claude-code/package.json")),
  "cli.js",
);

const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL;

if (!SLACK_APP_TOKEN || !SLACK_BOT_TOKEN || !SLACK_CHANNEL) {
  console.error("Missing required env vars: SLACK_APP_TOKEN, SLACK_BOT_TOKEN, SLACK_CHANNEL");
  process.exit(1);
}

const socketClient = new SocketModeClient({ appToken: SLACK_APP_TOKEN });
const webClient = new WebClient(SLACK_BOT_TOKEN);

// Track sessions currently being resumed to avoid duplicate invocations
const activeSessions = new Set<string>();

async function postError(threadTs: string, message: string): Promise<void> {
  try {
    await webClient.chat.postMessage({
      channel: SLACK_CHANNEL!,
      thread_ts: threadTs,
      text: `:warning: ${message}`,
    });
  } catch {
    console.error(`Failed to post error to thread ${threadTs}: ${message}`);
  }
}

function resumeSession(state: ThreadState, message: string): void {
  if (activeSessions.has(state.session_id)) {
    console.log(`Session ${state.session_id} already active, skipping`);
    return;
  }

  activeSessions.add(state.session_id);
  console.log(`Resuming session ${state.session_id} in ${state.cwd}`);

  const child = spawn("node", [CLAUDE_BIN, "-r", state.session_id, "-p", message], {
    cwd: state.cwd,
    stdio: "inherit",
    env: { ...process.env },
  });

  child.on("error", (err) => {
    console.error(`Failed to spawn claude for session ${state.session_id}:`, err.message);
    activeSessions.delete(state.session_id);
  });

  child.on("close", (code) => {
    console.log(`Session ${state.session_id} exited with code ${code}`);
    activeSessions.delete(state.session_id);
  });
}

socketClient.on("message", async ({ event, body, ack }) => {
  await ack();

  // Only process threaded messages in our channel
  if (event.channel !== SLACK_CHANNEL) return;
  if (!event.thread_ts) return;
  if (event.thread_ts === event.ts) return; // ignore parent messages

  // Ignore bot messages to avoid loops
  if (event.bot_id || event.subtype === "bot_message") return;

  const threadTs = event.thread_ts as string;
  const text = (event.text as string | undefined) ?? "";

  if (!text.trim()) return;

  console.log(`Reply in thread ${threadTs}: ${text.slice(0, 80)}`);

  const state = getStateByThread(threadTs);
  if (!state) {
    await postError(threadTs, "Could not find a Claude Code session for this thread.");
    return;
  }

  // Verify the session's working directory still exists
  if (!fs.existsSync(state.cwd)) {
    await postError(threadTs, `Project directory no longer exists: ${state.cwd}`);
    return;
  }

  // Verify cwd is an absolute path and contains a .claude directory (is a Claude project)
  if (!path.isAbsolute(state.cwd) || !fs.existsSync(path.join(state.cwd, ".claude"))) {
    await postError(threadTs, "Session working directory is not a valid Claude Code project.");
    return;
  }

  resumeSession(state, text);
});

socketClient.on("connected", () => {
  console.log("Slack listener connected via Socket Mode");
  console.log(`Watching channel: ${SLACK_CHANNEL}`);
});

socketClient.on("disconnected", () => {
  console.log("Disconnected from Slack, will reconnect...");
});

await socketClient.start();
