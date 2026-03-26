import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG_DIR = path.join(AGILE_DIR, "backlog");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");

function usage(): never {
  console.error("Usage: npx tsx process/agile/automation/sum-points.ts <parent_ticket>");
  console.error("  e.g. npx tsx process/agile/automation/sum-points.ts task-ESE-0001");
  process.exit(1);
}

const parentName = process.argv[2];
if (!parentName) usage();

function getAllTicketFiles(): string[] {
  const files: string[] = [];

  for (const f of fs.readdirSync(BACKLOG_DIR)) {
    if (f.endsWith(".md") && f !== "backlog.md") {
      files.push(path.join(BACKLOG_DIR, f));
    }
  }

  if (fs.existsSync(SPRINTS_DIR)) {
    for (const dir of fs.readdirSync(SPRINTS_DIR, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      for (const f of fs.readdirSync(path.join(SPRINTS_DIR, dir.name))) {
        if (f.endsWith(".md") && f.match(/^(?:feat|bugfix|task)-ESE-/)) {
          files.push(path.join(SPRINTS_DIR, dir.name, f));
        }
      }
    }
  }

  return files;
}

function getPoints(filePath: string): number {
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/^## Size\n(.+)$/m);
  if (!match) return 0;
  const val = match[1]!.trim();
  const num = parseInt(val, 10);
  return isNaN(num) ? 0 : num;
}

function sumRecursive(parentPrefix: string, allFiles: string[]): number {
  let total = 0;
  const subtasks = allFiles.filter(f => {
    const base = path.basename(f, ".md");
    return base.startsWith(parentPrefix + "-") && base.replace(parentPrefix + "-", "").match(/^\d+$/);
  });

  for (const sub of subtasks) {
    const subName = path.basename(sub, ".md");
    const childSubtasks = allFiles.filter(f => {
      const base = path.basename(f, ".md");
      return base.startsWith(subName + "-") && base !== subName;
    });

    if (childSubtasks.length > 0) {
      total += sumRecursive(subName, allFiles);
    } else {
      total += getPoints(sub);
    }
  }

  return total;
}

const allFiles = getAllTicketFiles();
const total = sumRecursive(parentName, allFiles);

console.log(`${parentName}: ${total} story points (recursive sum of subtasks)`);

// Update the parent ticket
const parentFile = allFiles.find(f => path.basename(f, ".md") === parentName);
if (parentFile) {
  let content = fs.readFileSync(parentFile, "utf-8");
  content = content.replace(/^(## Size\n).*$/m, `$1Sum of subtasks (${total})`);
  fs.writeFileSync(parentFile, content, "utf-8");
  console.log(`Updated ${parentName} size to: Sum of subtasks (${total})`);
}
