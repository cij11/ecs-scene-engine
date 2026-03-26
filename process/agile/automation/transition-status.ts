import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG_DIR = path.join(AGILE_DIR, "backlog");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");

const VALID_STATUSES = ["draft", "refining", "readyForDev", "inDevelopment", "inTesting", "done"] as const;

function usage(): never {
  console.error("Usage: npx tsx process/agile/automation/transition-status.ts <ticket> <new_status>");
  console.error(`  ticket     - ticket name (e.g. task-ESE-0001)`);
  console.error(`  new_status - ${VALID_STATUSES.join(" | ")}`);
  process.exit(1);
}

const ticketName = process.argv[2];
const newStatus = process.argv[3];
const team = process.argv[4] ?? process.env.CLAUDE_SESSION_ID ?? "unknown";

if (!ticketName || !newStatus) usage();
if (!VALID_STATUSES.includes(newStatus as typeof VALID_STATUSES[number])) {
  console.error(`Error: invalid status "${newStatus}". Must be one of: ${VALID_STATUSES.join(", ")}`);
  process.exit(1);
}

function findTicket(name: string): string | null {
  const fileName = `${name}.md`;
  const backlogPath = path.join(BACKLOG_DIR, fileName);
  if (fs.existsSync(backlogPath)) return backlogPath;

  const sprintDirs = fs.readdirSync(SPRINTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory());
  for (const dir of sprintDirs) {
    const sprintPath = path.join(SPRINTS_DIR, dir.name, fileName);
    if (fs.existsSync(sprintPath)) return sprintPath;
  }
  return null;
}

const ticketPath = findTicket(ticketName);
if (!ticketPath) {
  console.error(`Error: ticket "${ticketName}" not found in backlog or sprints.`);
  process.exit(1);
}

let content = fs.readFileSync(ticketPath, "utf-8");

const statusMatch = content.match(/^(## Status\n)(.+)$/m);
if (!statusMatch) {
  console.error("Error: could not find Status section in ticket.");
  process.exit(1);
}

const oldStatus = statusMatch[2]!.trim();
content = content.replace(/^(## Status\n).+$/m, `$1${newStatus}`);

const now = new Date().toISOString();

if (newStatus === "inDevelopment") {
  if (!content.match(/^## Started\n.+/m)) {
    content = content.replace(/^(## Started\n)$/m, `$1${now}`);
  }
  // Set team to current agent session
  content = content.replace(/^(## Team\n).*$/m, `$1${team}`);
}

if (newStatus === "done" && !content.match(/^## Completed\n.+/m)) {
  content = content.replace(/^(## Completed\n)$/m, `$1${now}`);
}

fs.writeFileSync(ticketPath, content, "utf-8");
console.log(`${ticketName}: ${oldStatus} → ${newStatus}`);
