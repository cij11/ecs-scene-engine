import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG_DIR = path.join(AGILE_DIR, "backlog");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");

const VALID_STATUSES = ["draft", "refining", "readyForDev", "inDevelopment", "inTesting", "done"] as const;

const REQUIRED_SECTIONS = [
  "Status", "Title", "Description", "Acceptance Criteria",
  "Testing Scenarios", "Testing Notes", "Size", "Subtasks",
  "Stakeholder Understanding", "Demo Accepted",
  "Team", "Started", "Completed", "Blockers", "Knowledge Gaps", "Comments",
];

function usage(): never {
  console.error("Usage: npx tsx process/agile/automation/transition-status.ts <ticket> <new_status> [team]");
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

function getSection(content: string, section: string): string {
  const regex = new RegExp(`^## ${section}\\n([\\s\\S]*?)(?=^## |$)`, "m");
  const match = content.match(regex);
  return match?.[1]?.trim() ?? "";
}

function hasSection(content: string, section: string): boolean {
  return content.includes(`## ${section}`);
}

// --- Validation gates ---

function validateReadyForDev(content: string, ticketName: string): string[] {
  const errors: string[] = [];

  // All sections must exist
  for (const section of REQUIRED_SECTIONS) {
    if (!hasSection(content, section)) {
      errors.push(`Missing section: ## ${section}`);
    }
  }

  // Key fields must be filled out
  const description = getSection(content, "Description");
  if (!description) errors.push("Description is empty");

  const ac = getSection(content, "Acceptance Criteria");
  if (!ac) errors.push("Acceptance Criteria is empty");

  const scenarios = getSection(content, "Testing Scenarios");
  if (!scenarios) errors.push("Testing Scenarios is empty");

  const size = getSection(content, "Size");
  if (!size) errors.push("Size is empty");

  // Size must be a number or "Sum of subtasks (N)"
  if (size && !size.match(/^\d+$/) && !size.startsWith("Sum of subtasks")) {
    errors.push(`Size must be a number or 'Sum of subtasks (N)', got: "${size}"`);
  }

  // Stakeholder must have explained the ticket back
  const understanding = getSection(content, "Stakeholder Understanding");
  if (!understanding) {
    errors.push("Stakeholder Understanding is empty — stakeholder must explain the ticket back to the agent before it can be marked ready");
  }

  return errors;
}

function validateDone(content: string, ticketName: string): string[] {
  const errors: string[] = [];

  // Must have been started
  const started = getSection(content, "Started");
  if (!started) errors.push("Started timestamp is empty — ticket was never started");

  // Acceptance criteria must exist
  const ac = getSection(content, "Acceptance Criteria");
  if (!ac) errors.push("Acceptance Criteria is empty — cannot verify done");

  // Size must be set
  const size = getSection(content, "Size");
  if (!size) errors.push("Size is empty — velocity cannot be calculated");

  // CI must pass
  const ROOT = path.resolve(AGILE_DIR, "..", "..");
  try {
    execSync("npm run ci", { cwd: ROOT, stdio: "pipe" });
  } catch (e: any) {
    const output = e.stdout?.toString() ?? "";
    const stderr = e.stderr?.toString() ?? "";
    const firstError = (output + "\n" + stderr).split("\n").find((l: string) => l.includes("FAIL") || l.includes("error") || l.includes("Error")) ?? "unknown error";
    errors.push(`CI pipeline failed: ${firstError.trim()}`);
  }

  // If it has subtasks, check they're all done
  const subtasks = getSection(content, "Subtasks");
  if (subtasks) {
    const subtaskNames = subtasks.match(/(?:feat|bugfix|task)-ESE-\d{4}(?:-\d{2})?/g);
    if (subtaskNames) {
      for (const subName of subtaskNames) {
        const subPath = findTicket(subName);
        if (subPath) {
          const subContent = fs.readFileSync(subPath, "utf-8");
          const subStatus = getSection(subContent, "Status");
          if (subStatus !== "done") {
            errors.push(`Subtask ${subName} is "${subStatus}", not done`);
          }
        }
      }
    }
  }

  return errors;
}

// --- Main ---

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

// Run validation gates
if (newStatus === "readyForDev") {
  const errors = validateReadyForDev(content, ticketName);
  if (errors.length > 0) {
    console.error(`BLOCKED: ${ticketName} cannot transition to readyForDev:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

if (newStatus === "done") {
  const errors = validateDone(content, ticketName);
  if (errors.length > 0) {
    console.error(`BLOCKED: ${ticketName} cannot transition to done:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

// Apply transition
content = content.replace(/^(## Status\n).+$/m, `$1${newStatus}`);

const now = new Date().toISOString();

if (newStatus === "inDevelopment") {
  if (!content.match(/^## Started\n.+/m)) {
    content = content.replace(/^(## Started\n)$/m, `$1${now}`);
  }
  content = content.replace(/^(## Team\n).*$/m, `$1${team}`);
}

if (newStatus === "done" && !content.match(/^## Completed\n.+/m)) {
  content = content.replace(/^(## Completed\n)$/m, `$1${now}`);
}

fs.writeFileSync(ticketPath, content, "utf-8");
console.log(`${ticketName}: ${oldStatus} → ${newStatus}`);
