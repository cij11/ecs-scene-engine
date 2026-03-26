import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG_DIR = path.join(AGILE_DIR, "backlog");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");

function usage(): never {
  console.error("Usage: npx tsx process/agile/automation/create-ticket.ts <type> <title> [parent]");
  console.error("  type   - feat | bugfix | task");
  console.error("  title  - short ticket title");
  console.error("  parent - optional parent ticket number (e.g. 0001)");
  process.exit(1);
}

const type = process.argv[2];
const title = process.argv[3];
const parent = process.argv[4];

if (!type || !title) usage();
if (!["feat", "bugfix", "task"].includes(type)) {
  console.error(`Error: type must be feat, bugfix, or task. Got "${type}".`);
  process.exit(1);
}

function collectTicketFiles(): string[] {
  const backlogFiles = fs.readdirSync(BACKLOG_DIR).filter(f => f.endsWith(".md") && f !== "backlog.md");
  const sprintDirs = fs.existsSync(SPRINTS_DIR)
    ? fs.readdirSync(SPRINTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .flatMap(d =>
          fs.readdirSync(path.join(SPRINTS_DIR, d.name))
            .filter(f => f.endsWith(".md") && !f.startsWith("sprint_"))
        )
    : [];
  return [...backlogFiles, ...sprintDirs];
}

const files = collectTicketFiles();

let ticketId: string;

if (parent) {
  const parentPrefix = `${type}-ESE-${parent}-`;
  const subtaskNumbers = files
    .filter(f => f.startsWith(parentPrefix))
    .map(f => {
      const match = f.match(new RegExp(`${parentPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)\\.md$`));
      return match ? parseInt(match[1]!, 10) : 0;
    });
  const nextSub = subtaskNumbers.length > 0 ? Math.max(...subtaskNumbers) + 1 : 1;
  ticketId = `${parent}-${String(nextSub).padStart(2, "0")}`;
} else {
  const topLevelNumbers = files
    .map(f => {
      const match = f.match(/^(?:feat|bugfix|task)-ESE-(\d{4})(?:\.md|-)/);
      return match ? parseInt(match[1]!, 10) : 0;
    });
  const nextNum = topLevelNumbers.length > 0 ? Math.max(...topLevelNumbers) + 1 : 1;
  ticketId = String(nextNum).padStart(4, "0");
}

const fullName = `${type}-ESE-${ticketId}`;
const fileName = `${fullName}.md`;
const filePath = path.join(BACKLOG_DIR, fileName);

const template = `## Status
draft

## Title
${fullName}: ${title}

## Description

## Acceptance Criteria

## Testing Scenarios

## Testing Notes

## Size

## Subtasks

## Team

## Started

## Completed

## Blockers

## Knowledge Gaps

## Comments
`;

fs.writeFileSync(filePath, template, "utf-8");
console.log(`Created ${fileName}`);
