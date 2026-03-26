import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG_DIR = path.join(AGILE_DIR, "backlog");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");

function usage(): never {
  console.error("Usage: npx tsx process/agile/automation/promote-subtask.ts <subtask>");
  console.error("  subtask - subtask ticket name (e.g. task-ESE-0001-03)");
  process.exit(1);
}

const subtaskName = process.argv[2];
if (!subtaskName) usage();

const match = subtaskName.match(/^(feat|bugfix|task)-ESE-(\d{4})-(\d{2})$/);
if (!match) {
  console.error(`Error: "${subtaskName}" doesn't look like a subtask (expected format: type-ESE-xxxx-xx).`);
  process.exit(1);
}

const [, type, parentNum] = match;
const parentName = `${type}-ESE-${parentNum}`;

function findAllTicketDirs(): string[] {
  const dirs = [BACKLOG_DIR];
  if (fs.existsSync(SPRINTS_DIR)) {
    for (const d of fs.readdirSync(SPRINTS_DIR, { withFileTypes: true })) {
      if (d.isDirectory()) dirs.push(path.join(SPRINTS_DIR, d.name));
    }
  }
  return dirs;
}

function findTicket(name: string, dirs: string[]): string | null {
  for (const dir of dirs) {
    const p = path.join(dir, `${name}.md`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const dirs = findAllTicketDirs();

// Find the subtask
const subtaskPath = findTicket(subtaskName, dirs);
if (!subtaskPath) {
  console.error(`Error: subtask "${subtaskName}" not found.`);
  process.exit(1);
}

// Determine next available top-level number
const allFiles: string[] = [];
for (const dir of dirs) {
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(".md")) allFiles.push(f);
  }
}

const topLevelNumbers = allFiles
  .map(f => {
    const m = f.match(/^(?:feat|bugfix|task)-ESE-(\d{4})(?:\.md|-)/);
    return m ? parseInt(m[1]!, 10) : 0;
  });
const nextNum = Math.max(...topLevelNumbers) + 1;
const newId = String(nextNum).padStart(4, "0");
const newName = `${type}-ESE-${newId}`;

// Read subtask content and rename
let content = fs.readFileSync(subtaskPath, "utf-8");
content = content.replace(subtaskName, newName);

const subtaskDir = path.dirname(subtaskPath);
const newPath = path.join(subtaskDir, `${newName}.md`);
fs.writeFileSync(newPath, content, "utf-8");
fs.unlinkSync(subtaskPath);

console.log(`Promoted ${subtaskName} → ${newName}`);

// Update parent ticket reference
const parentPath = findTicket(parentName, dirs);
if (parentPath) {
  let parentContent = fs.readFileSync(parentPath, "utf-8");
  parentContent = parentContent.replace(
    new RegExp(subtaskName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"),
    newName
  );
  fs.writeFileSync(parentPath, parentContent, "utf-8");
  console.log(`Updated reference in ${parentName}`);
}

// Rename any existing sub-subtasks of the old subtask to be subtasks of the new ticket
const oldSubPrefix = `${subtaskName}-`;
for (const dir of dirs) {
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(oldSubPrefix) && f.endsWith(".md")) {
      const subNum = f.replace(oldSubPrefix, "").replace(".md", "");
      const newSubName = `${newName}-${subNum}`;
      let subContent = fs.readFileSync(path.join(dir, f), "utf-8");
      subContent = subContent.replace(f.replace(".md", ""), newSubName);
      fs.writeFileSync(path.join(dir, `${newSubName}.md`), subContent, "utf-8");
      fs.unlinkSync(path.join(dir, f));
      console.log(`Renamed subtask ${f.replace(".md", "")} → ${newSubName}`);
    }
  }
}
