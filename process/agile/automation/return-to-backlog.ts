import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG_DIR = path.join(AGILE_DIR, "backlog");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");

function usage(): never {
  console.error("Usage: npx tsx process/agile/automation/return-to-backlog.ts <ticket> <sprint>");
  console.error("  ticket - ticket name (e.g. task-ESE-0001)");
  console.error("  sprint - sprint directory name (e.g. sprint_1_2026_03_25)");
  process.exit(1);
}

const ticketName = process.argv[2];
const sprintName = process.argv[3];

if (!ticketName || !sprintName) usage();

const sprintDir = path.join(SPRINTS_DIR, sprintName);
if (!fs.existsSync(sprintDir)) {
  console.error(`Error: sprint "${sprintName}" not found.`);
  process.exit(1);
}

const fileName = `${ticketName}.md`;
const sourcePath = path.join(sprintDir, fileName);

if (!fs.existsSync(sourcePath)) {
  console.error(`Error: ticket "${ticketName}" not found in ${sprintName}.`);
  process.exit(1);
}

if (!fs.existsSync(BACKLOG_DIR)) {
  fs.mkdirSync(BACKLOG_DIR, { recursive: true });
}

// Move ticket
fs.renameSync(sourcePath, path.join(BACKLOG_DIR, fileName));
console.log(`${ticketName} → backlog`);

// Move subtasks
const subtaskPrefix = `${ticketName}-`;
const subtasks = fs.readdirSync(sprintDir).filter(f => f.startsWith(subtaskPrefix) && f.endsWith(".md"));

for (const sub of subtasks) {
  fs.renameSync(path.join(sprintDir, sub), path.join(BACKLOG_DIR, sub));
  console.log(`${sub.replace(".md", "")} → backlog`);
}

// Update sprint doc
const sprintDocPath = path.join(sprintDir, `${sprintName}.md`);
if (fs.existsSync(sprintDocPath)) {
  let doc = fs.readFileSync(sprintDocPath, "utf-8");
  doc = doc.replace(new RegExp(`^- ${ticketName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`, "m"), "");
  fs.writeFileSync(sprintDocPath, doc, "utf-8");
}

console.log(`Returned ${ticketName} (${subtasks.length} subtasks) to backlog.`);
