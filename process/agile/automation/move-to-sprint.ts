import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG_DIR = path.join(AGILE_DIR, "backlog");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");

function usage(): never {
  console.error("Usage: npx tsx process/agile/automation/move-to-sprint.ts <ticket> <sprint>");
  console.error("  ticket - ticket name (e.g. task-ESE-0001)");
  console.error("  sprint - sprint directory name (e.g. sprint_1_2026_03_25)");
  process.exit(1);
}

const ticketName = process.argv[2];
const sprintName = process.argv[3];

if (!ticketName || !sprintName) usage();

const sprintDir = path.join(SPRINTS_DIR, sprintName);
if (!fs.existsSync(sprintDir)) {
  console.error(`Error: sprint directory "${sprintName}" not found.`);
  process.exit(1);
}

const fileName = `${ticketName}.md`;
const sourcePath = path.join(BACKLOG_DIR, fileName);
const destPath = path.join(sprintDir, fileName);

if (!fs.existsSync(sourcePath)) {
  console.error(`Error: ticket "${ticketName}" not found in backlog.`);
  process.exit(1);
}

fs.renameSync(sourcePath, destPath);
console.log(`Moved ${ticketName} → ${sprintName}`);

// Also move subtasks
const subtaskPrefix = `${ticketName}-`;
const subtasks = fs.readdirSync(BACKLOG_DIR).filter(f => f.startsWith(subtaskPrefix) && f.endsWith(".md"));

for (const sub of subtasks) {
  fs.renameSync(path.join(BACKLOG_DIR, sub), path.join(sprintDir, sub));
  console.log(`Moved ${sub.replace(".md", "")} → ${sprintName}`);
}

if (subtasks.length > 0) {
  console.log(`Moved ${subtasks.length} subtask(s) along with parent.`);
}
