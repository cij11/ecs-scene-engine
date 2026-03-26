import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG_DIR = path.join(AGILE_DIR, "backlog");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");
const ROOT = path.resolve(AGILE_DIR, "..", "..");
const TICKET_STATUS_PATH = path.join(SPRINTS_DIR, "ticketStatus.json");

interface TicketStatusEntry {
  filename: string;
  status: string;
}

interface TicketStatusFile {
  tickets: TicketStatusEntry[];
}

function loadTicketStatus(): TicketStatusFile {
  if (!fs.existsSync(TICKET_STATUS_PATH)) {
    return { tickets: [] };
  }
  return JSON.parse(fs.readFileSync(TICKET_STATUS_PATH, "utf-8")) as TicketStatusFile;
}

function saveTicketStatus(data: TicketStatusFile): void {
  fs.writeFileSync(TICKET_STATUS_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function getTicketFilename(ticketPath: string): string {
  // Return path relative to sprints/ or backlog/
  const sprintsIdx = ticketPath.indexOf("sprints/");
  if (sprintsIdx >= 0) {
    return ticketPath.slice(sprintsIdx + "sprints/".length);
  }
  const backlogIdx = ticketPath.indexOf("backlog/");
  if (backlogIdx >= 0) {
    return "backlog/" + ticketPath.slice(backlogIdx + "backlog/".length);
  }
  return ticketPath;
}

function getStatusFromRegistry(name: string): string | null {
  const data = loadTicketStatus();
  const entry = data.tickets.find((t) => t.filename.includes(name));
  return entry?.status ?? null;
}

const VALID_STATUSES = [
  "draft",
  "refining",
  "readyForDev",
  "inDevelopment",
  "inReview",
  "inTesting",
  "buildingDemo",
  "validatingDemo",
  "demoValidated",
  "humanDemoValidation",
  "done",
] as const;

const DEMO_STATUSES = new Set([
  "buildingDemo",
  "validatingDemo",
  "demoValidated",
  "humanDemoValidation",
]);

const REQUIRED_SECTIONS = [
  "Status",
  "Title",
  "Description",
  "Acceptance Criteria",
  "Demo Deliverable",
  "Testing Scenarios",
  "Testing Notes",
  "Size",
  "Subtasks",
  "Stakeholder Understanding",
  "Demo Accepted",
  "Team",
  "Started",
  "Completed",
  "Blockers",
  "Knowledge Gaps",
  "Comments",
];

// Backward transitions are always allowed — gates only apply on the forward path.

function usage(): never {
  console.error(
    "Usage: npx tsx process/agile/automation/transition-status.ts <ticket> <new_status> [team]",
  );
  console.error(`  ticket     - ticket name (e.g. task-ESE-0001)`);
  console.error(`  new_status - ${VALID_STATUSES.join(" | ")}`);
  process.exit(1);
}

const ticketName = process.argv[2];
const newStatus = process.argv[3];
const team = process.argv[4] ?? process.env.CLAUDE_SESSION_ID ?? "unknown";

if (!ticketName || !newStatus) usage();
if (!VALID_STATUSES.includes(newStatus as (typeof VALID_STATUSES)[number])) {
  console.error(
    `Error: invalid status "${newStatus}". Must be one of: ${VALID_STATUSES.join(", ")}`,
  );
  process.exit(1);
}

// --- Helpers ---

function findTicket(name: string): string | null {
  const fileName = `${name}.md`;
  const backlogPath = path.join(BACKLOG_DIR, fileName);
  if (fs.existsSync(backlogPath)) return backlogPath;

  const sprintDirs = fs.readdirSync(SPRINTS_DIR, { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  );
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

function isFeatTicket(name: string): boolean {
  return name.startsWith("feat-");
}

function getSprintDir(ticketPath: string): string | null {
  const dir = path.dirname(ticketPath);
  if (dir.includes("sprints")) return dir;
  return null;
}

function getDemoDir(ticketPath: string): string | null {
  const sprintDir = getSprintDir(ticketPath);
  if (!sprintDir) return null;
  return path.join(sprintDir, "demo");
}

// --- Validation gates ---

function validateReadyForDev(content: string, name: string): string[] {
  const errors: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    if (!hasSection(content, section)) {
      errors.push(`Missing section: ## ${section}`);
    }
  }

  const description = getSection(content, "Description");
  if (!description) errors.push("Description is empty");

  const ac = getSection(content, "Acceptance Criteria");
  if (!ac) errors.push("Acceptance Criteria is empty");

  const scenarios = getSection(content, "Testing Scenarios");
  if (!scenarios) errors.push("Testing Scenarios is empty");

  const size = getSection(content, "Size");
  if (!size) errors.push("Size is empty");

  if (size && !size.match(/^\d+$/) && !size.startsWith("Sum of subtasks")) {
    errors.push(`Size must be a number or 'Sum of subtasks (N)', got: "${size}"`);
  }

  const understanding = getSection(content, "Stakeholder Understanding");
  if (!understanding) {
    errors.push(
      "Stakeholder Understanding is empty — stakeholder must explain the ticket back to the agent",
    );
  }

  if (isFeatTicket(name)) {
    const demoDeliverable = getSection(content, "Demo Deliverable");
    if (!demoDeliverable) {
      errors.push("Demo Deliverable is empty — feat tickets must define what the demo should show");
    }
  }

  return errors;
}

function validateInReview(ticketPath: string): string[] {
  const errors: string[] = [];
  const dir = path.dirname(ticketPath);
  const reviewPath = path.join(dir, "review.md");

  // For transitioning FROM inReview, review.md must exist and have no severe/critical issues
  if (!fs.existsSync(reviewPath)) {
    errors.push("Missing review.md — code review must be documented before proceeding");
    return errors;
  }

  const review = fs.readFileSync(reviewPath, "utf-8").toLowerCase();

  if (review.includes("critical")) {
    errors.push("review.md contains critical issues — these must be resolved before proceeding");
  }

  if (review.includes("severe")) {
    errors.push("review.md contains severe issues — these must be resolved before proceeding");
  }

  return errors;
}

function validateHumanDemoValidation(ticketPath: string): string[] {
  const errors: string[] = [];
  const demoDir = getDemoDir(ticketPath);
  if (!demoDir) {
    errors.push("Ticket is not in a sprint");
    return errors;
  }

  // Must have passed through validatingDemo — demo-expected.json must exist
  const expectedPath = path.join(demoDir, "demo-expected.json");
  if (!fs.existsSync(expectedPath)) {
    errors.push("Missing demo-expected.json — validatingDemo step was not completed");
  }

  // Must have passed through demoValidated — demo-actual.json must exist with all answers
  const actualPath = path.join(demoDir, "demo-actual.json");
  if (!fs.existsSync(actualPath)) {
    errors.push("Missing demo-actual.json — demoValidated step was not completed");
    return errors;
  }

  try {
    const actual = JSON.parse(fs.readFileSync(actualPath, "utf-8"));

    if (!actual.allQuestionsAnswered) {
      errors.push("demo-actual.json: allQuestionsAnswered is not true — agent validation incomplete");
    }

    if (!actual.demoMatchesExpected) {
      errors.push("demo-actual.json: demoMatchesExpected is not true — agent has not confirmed demo matches expected");
    }

    if (!actual.videoInterpretation) {
      errors.push("demo-actual.json: missing videoInterpretation");
    }
  } catch {
    errors.push("demo-actual.json: invalid JSON");
  }

  return errors;
}

function validateInTesting(): string[] {
  const errors: string[] = [];
  try {
    execSync("npm run ci", { cwd: ROOT, stdio: "pipe" });
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    const output = (err.stdout?.toString() ?? "") + "\n" + (err.stderr?.toString() ?? "");
    const firstError =
      output
        .split("\n")
        .find(
          (l: string) => l.includes("FAIL") || l.includes("error") || l.includes("Error"),
        ) ?? "unknown error";
    errors.push(`CI pipeline failed: ${firstError.trim()}`);
  }
  return errors;
}

function validateValidatingDemo(ticketPath: string): string[] {
  const errors: string[] = [];
  const demoDir = getDemoDir(ticketPath);

  if (!demoDir) {
    errors.push("Ticket is not in a sprint — cannot create demo directory");
    return errors;
  }

  if (!fs.existsSync(demoDir)) {
    errors.push(`Missing demo/ directory at ${demoDir}`);
  }

  const expectedPath = path.join(demoDir, "demo-expected.json");
  if (!fs.existsSync(expectedPath)) {
    errors.push("Missing demo-expected.json — must contain description and durationMs");
  } else {
    try {
      const expected = JSON.parse(fs.readFileSync(expectedPath, "utf-8"));
      if (!expected.description) errors.push("demo-expected.json: missing description");
      if (!expected.durationMs) errors.push("demo-expected.json: missing durationMs");
    } catch {
      errors.push("demo-expected.json: invalid JSON");
    }
  }

  const readmePath = path.join(demoDir, "demo-readme.json");
  if (!fs.existsSync(readmePath)) {
    errors.push("Missing demo-readme.json — must contain command, frameCount, screenshots");
  } else {
    try {
      const readme = JSON.parse(fs.readFileSync(readmePath, "utf-8"));
      if (!readme.command) errors.push("demo-readme.json: missing command");
      if (!readme.frameCount) errors.push("demo-readme.json: missing frameCount");
      if (!Array.isArray(readme.screenshots) || readme.screenshots.length === 0) {
        errors.push("demo-readme.json: missing or empty screenshots array");
      }
    } catch {
      errors.push("demo-readme.json: invalid JSON");
    }
  }

  return errors;
}

function validateDemoValidated(ticketPath: string): string[] {
  const errors: string[] = [];
  const demoDir = getDemoDir(ticketPath);
  if (!demoDir) {
    errors.push("Ticket is not in a sprint");
    return errors;
  }

  const actualPath = path.join(demoDir, "demo-actual.json");
  if (!fs.existsSync(actualPath)) {
    errors.push("Missing demo-actual.json — agent must review screenshots first");
    return errors;
  }

  try {
    const actual = JSON.parse(fs.readFileSync(actualPath, "utf-8"));

    if (!actual.videoInterpretation) {
      errors.push("demo-actual.json: missing videoInterpretation");
    }

    if (!Array.isArray(actual.screenshots) || actual.screenshots.length === 0) {
      errors.push("demo-actual.json: missing or empty screenshots array");
    } else {
      for (let i = 0; i < actual.screenshots.length; i++) {
        const ss = actual.screenshots[i];
        if (!ss.screenshotInterpretation) {
          errors.push(`demo-actual.json: screenshot ${i} missing screenshotInterpretation`);
        }
      }
    }

    // Check expected matches actual
    const expectedPath = path.join(demoDir, "demo-expected.json");
    if (fs.existsSync(expectedPath)) {
      const expected = JSON.parse(fs.readFileSync(expectedPath, "utf-8"));
      if (
        actual.videoInterpretation &&
        expected.description &&
        !actual.demoMatchesExpected
      ) {
        errors.push(
          "demo-actual.json: demoMatchesExpected must be set to true — agent must confirm the actual demo matches the expected demo",
        );
      }
    }
  } catch {
    errors.push("demo-actual.json: invalid JSON");
  }

  return errors;
}

function validateDone(content: string, name: string, ticketPath: string): string[] {
  const errors: string[] = [];

  const started = getSection(content, "Started");
  if (!started) errors.push("Started timestamp is empty — ticket was never started");

  const ac = getSection(content, "Acceptance Criteria");
  if (!ac) errors.push("Acceptance Criteria is empty — cannot verify done");

  const size = getSection(content, "Size");
  if (!size) errors.push("Size is empty — velocity cannot be calculated");

  // CI must pass
  const ciErrors = validateInTesting();
  errors.push(...ciErrors);

  // Feat tickets must have accepted demo
  if (isFeatTicket(name)) {
    const demoAccepted = getSection(content, "Demo Accepted");
    if (!demoAccepted || !demoAccepted.toLowerCase().startsWith("accepted")) {
      errors.push("Demo Accepted must be 'accepted' — stakeholder must accept the demo first");
    }
  }

  // Subtasks must be done
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

// Read status from ticketStatus.json (authoritative source)
const registryStatus = getStatusFromRegistry(ticketName);
const statusMatch = content.match(/^(## Status\n)(.+)$/m);
const fileStatus = statusMatch?.[2]?.trim() ?? "draft";
const oldStatus = registryStatus ?? fileStatus;

// Validate transition direction — backward transitions skip gates
const oldIdx = VALID_STATUSES.indexOf(oldStatus as (typeof VALID_STATUSES)[number]);
const newIdx = VALID_STATUSES.indexOf(newStatus as (typeof VALID_STATUSES)[number]);
const isBackward = oldIdx >= 0 && newIdx >= 0 && newIdx < oldIdx;

if (isBackward) {
  console.log(`  (backward transition: ${oldStatus} → ${newStatus})`);
}

// Check if demo statuses are valid for this ticket type
if (DEMO_STATUSES.has(newStatus) && !isFeatTicket(ticketName)) {
  console.error(
    `BLOCKED: ${ticketName} is not a feat ticket — demo statuses are only for feat tickets`,
  );
  process.exit(1);
}

// Run validation gates (only on forward transitions)
let errors: string[] = [];

if (!isBackward) switch (newStatus) {
  case "readyForDev":
    errors = validateReadyForDev(content, ticketName);
    break;
  case "inTesting":
    errors = [...validateInReview(ticketPath), ...validateInTesting()];
    break;
  case "validatingDemo":
    errors = validateValidatingDemo(ticketPath);
    break;
  case "demoValidated":
    errors = validateDemoValidated(ticketPath);
    break;
  case "humanDemoValidation":
    errors = validateHumanDemoValidation(ticketPath);
    break;
  case "done":
    errors = validateDone(content, ticketName, ticketPath);
    break;
}

if (errors.length > 0) {
  console.error(`BLOCKED: ${ticketName} cannot transition to ${newStatus}:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

// Apply transition — update ticketStatus.json (authoritative)
const now = new Date().toISOString();
const ticketFilename = getTicketFilename(ticketPath);
const statusData = loadTicketStatus();
const existingEntry = statusData.tickets.find((t) => t.filename === ticketFilename);
if (existingEntry) {
  existingEntry.status = newStatus;
} else {
  statusData.tickets.push({ filename: ticketFilename, status: newStatus });
}
saveTicketStatus(statusData);

// Update ticket file (non-status fields only: Started, Completed, Team)
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

// Write audit log entry
const AUDIT_LOG = path.join(AGILE_DIR, "automation", "audit-log.jsonl");
const auditEntry = JSON.stringify({
  timestamp: now,
  ticket: ticketName,
  from: oldStatus,
  to: newStatus,
  team,
});
fs.appendFileSync(AUDIT_LOG, auditEntry + "\n", "utf-8");

console.log(`${ticketName}: ${oldStatus} → ${newStatus}`);
