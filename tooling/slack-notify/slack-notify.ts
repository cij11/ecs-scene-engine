/**
 * Slack notification hook for Claude Code.
 * Sends conversation context to Slack when an agent stops or needs input.
 *
 * Supports two modes:
 *   1. Bot token (threaded): SLACK_BOT_TOKEN + SLACK_CHANNEL
 *      Each agent session gets its own thread.
 *   2. Webhook (simple):     SLACK_WEBHOOK_URL
 *      Each notification is a standalone message.
 *
 * Bot token mode is preferred. Falls back to webhook if token is not set.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

const useBot = !!(SLACK_BOT_TOKEN && SLACK_CHANNEL);
if (!useBot && !SLACK_WEBHOOK_URL) process.exit(0);

const MAX_CONTEXT_CHARS = 3800;
const THREAD_STATE_DIR = path.join(os.tmpdir(), "claude-slack-threads");

interface HookInput {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  transcript_path?: string;
  last_assistant_message?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
  content?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface TranscriptEntry {
  type?: string;
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
  };
}

async function readStdin(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin });
  const lines: string[] = [];
  for await (const line of rl) lines.push(line);
  return lines.join("\n");
}

function summariseContent(content: ContentBlock[] | string | undefined): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && block.text) {
      parts.push(block.text);
    } else if (block.type === "tool_use" && block.name) {
      parts.push(`[${block.name}]`);
    } else if (block.type === "tool_result") {
      const result = typeof block.content === "string"
        ? block.content.slice(0, 200)
        : "[result]";
      parts.push(result);
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function extractContext(input: HookInput): string {
  if (input.transcript_path && fs.existsSync(input.transcript_path)) {
    const raw = fs.readFileSync(input.transcript_path, "utf-8");
    const lines = raw.trim().split("\n");
    const recent = lines.slice(-20);

    const messages: string[] = [];
    for (const line of recent) {
      try {
        const entry: TranscriptEntry = JSON.parse(line);
        const role = entry.type ?? entry.message?.role;
        if (role === "assistant" || role === "user") {
          const text = summariseContent(entry.message?.content);
          if (text) {
            messages.push(`${role.toUpperCase()}: ${text}`);
          }
        }
      } catch {
        // skip malformed lines
      }
    }

    const context = messages.slice(-30).join("\n");
    if (context) return context.slice(0, MAX_CONTEXT_CHARS);
  }

  if (input.last_assistant_message) {
    return input.last_assistant_message.slice(0, MAX_CONTEXT_CHARS);
  }

  return "(no context available)";
}

interface ThreadState {
  session_id: string;
  thread_ts: string;
  cwd: string;
}

function sanitiseFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getThreadTs(sessionId: string): string | undefined {
  try {
    const file = path.join(THREAD_STATE_DIR, `${sanitiseFilename(sessionId)}.json`);
    const state: ThreadState = JSON.parse(fs.readFileSync(file, "utf-8"));
    return state.thread_ts;
  } catch {
    return undefined;
  }
}

function saveThreadState(sessionId: string, threadTs: string, cwd: string): void {
  try {
    fs.mkdirSync(THREAD_STATE_DIR, { recursive: true });

    const state: ThreadState = { session_id: sessionId, thread_ts: threadTs, cwd };
    fs.writeFileSync(
      path.join(THREAD_STATE_DIR, `${sanitiseFilename(sessionId)}.json`),
      JSON.stringify(state, null, 2),
      "utf-8",
    );

    // Reverse index: thread_ts → session_id
    const indexPath = path.join(THREAD_STATE_DIR, "by-thread.json");
    let index: Record<string, string> = {};
    try {
      index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    } catch {
      // fresh index
    }
    index[threadTs] = sessionId;
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf-8");
  } catch {
    // best effort
  }
}

function buildBlocks(emoji: string, title: string, project: string, sessionId: string, context: string) {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: `${emoji} ${title}`, emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Project:*\n${project}` },
        { type: "mrkdwn", text: `*Session:*\n${sessionId.slice(0, 12)}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Recent context:*\n\`\`\`${context}\`\`\``,
      },
    },
  ];
}

async function postWithBot(blocks: unknown[], sessionId: string, cwd: string): Promise<void> {
  const threadTs = getThreadTs(sessionId);

  const body: Record<string, unknown> = {
    channel: SLACK_CHANNEL,
    blocks,
    unfurl_links: false,
  };
  if (threadTs) {
    body.thread_ts = threadTs;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!threadTs) {
      const data = (await res.json()) as { ok?: boolean; ts?: string };
      if (data.ok && data.ts) {
        saveThreadState(sessionId, data.ts, cwd);
      }
    }
  } catch {
    // fail gracefully
  } finally {
    clearTimeout(timeout);
  }
}

async function postWithWebhook(blocks: unknown[]): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    await fetch(SLACK_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
      signal: controller.signal,
    });
  } catch {
    // fail gracefully
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const raw = await readStdin();
  let input: HookInput;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const event = input.hook_event_name ?? "";
  const sessionId = input.session_id ?? "unknown";
  const project = path.basename(input.cwd ?? "unknown");

  let title: string;
  let emoji: string;

  switch (event) {
    case "Stop":
      title = "Agent finished";
      emoji = ":white_check_mark:";
      break;
    case "Notification":
      title = "Agent needs input";
      emoji = ":bell:";
      break;
    default:
      process.exit(0);
  }

  const context = extractContext(input);
  const blocks = buildBlocks(emoji, title, project, sessionId, context);

  if (useBot) {
    await postWithBot(blocks, sessionId, input.cwd ?? process.cwd());
  } else {
    await postWithWebhook(blocks);
  }
}

main();
