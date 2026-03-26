/**
 * Slack notification hook for Claude Code.
 * Sends conversation context to Slack when an agent stops or needs input.
 *
 * Required env var: SLACK_WEBHOOK_URL
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
if (!SLACK_WEBHOOK_URL) process.exit(0);

const MAX_CONTEXT_CHARS = 3800;

interface HookInput {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  transcript_path?: string;
  last_assistant_message?: string;
}

interface TranscriptLine {
  type?: string;
  content?: string;
  message?: string;
}

async function readStdin(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin });
  const lines: string[] = [];
  for await (const line of rl) lines.push(line);
  return lines.join("\n");
}

function extractContext(input: HookInput): string {
  if (input.transcript_path && fs.existsSync(input.transcript_path)) {
    const raw = fs.readFileSync(input.transcript_path, "utf-8");
    const lines = raw.trim().split("\n");
    const recent = lines.slice(-20);

    const messages: string[] = [];
    for (const line of recent) {
      try {
        const entry: TranscriptLine = JSON.parse(line);
        if (entry.type === "assistant" || entry.type === "user") {
          const content = entry.content ?? entry.message ?? "[tool use]";
          messages.push(`${entry.type.toUpperCase()}: ${content}`);
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

  const payload = {
    blocks: [
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
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    await fetch(SLACK_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // fail gracefully
  } finally {
    clearTimeout(timeout);
  }
}

main();
