/**
 * Shared thread state for mapping between Slack threads and Claude Code sessions.
 * State files are stored in $TMPDIR/claude-slack-threads/ as JSON.
 *
 * Each file is named by session_id and contains:
 *   { session_id, thread_ts, cwd }
 *
 * An index file (by-thread.json) maps thread_ts → session_id for reverse lookup.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const THREAD_STATE_DIR = path.join(os.tmpdir(), "claude-slack-threads");

export interface ThreadState {
  session_id: string;
  thread_ts: string;
  cwd: string;
}

const INDEX_PATH = path.join(THREAD_STATE_DIR, "by-thread.json");

function sanitiseFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function ensureDir(): void {
  fs.mkdirSync(THREAD_STATE_DIR, { recursive: true });
}

function readIndex(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeIndex(index: Record<string, string>): void {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
}

export function saveThreadState(state: ThreadState): void {
  ensureDir();
  const filePath = path.join(THREAD_STATE_DIR, `${sanitiseFilename(state.session_id)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");

  const index = readIndex();
  index[state.thread_ts] = state.session_id;
  writeIndex(index);
}

export function getThreadTsBySession(sessionId: string): string | undefined {
  try {
    const filePath = path.join(THREAD_STATE_DIR, `${sanitiseFilename(sessionId)}.json`);
    const state: ThreadState = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return state.thread_ts;
  } catch {
    return undefined;
  }
}

export function getStateByThread(threadTs: string): ThreadState | undefined {
  const index = readIndex();
  const sessionId = index[threadTs];
  if (!sessionId) return undefined;

  try {
    const filePath = path.join(THREAD_STATE_DIR, `${sanitiseFilename(sessionId)}.json`);
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ThreadState;
  } catch {
    return undefined;
  }
}
