import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG_DIR = path.join(AGILE_DIR, "backlog");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");
const ROOT = path.resolve(AGILE_DIR, "..", "..");

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

/** Allowed backward transitions (status → allowed previous statuses) */
const BACKWARD_TRANSITIONS: Record<string, string[]> = {
  inDevelopment: ["inReview"], // code review failed
  buildingDemo: ["demoValidated", "humanDemoValidation"], // demo rejected
};

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

const statusMatch = content.match(/^(## Status\n)(.+)$/m);
if (!statusMatch) {
  console.error("Error: could not find Status section in ticket.");
  process.exit(1);
}

const oldStatus = statusMatch[2]!.trim();

// Validate transition direction
const oldIdx = VALID_STATUSES.indexOf(oldStatus as (typeof VALID_STATUSES)[number]);
const newIdx = VALID_STATUSES.indexOf(newStatus as (typeof VALID_STATUSES)[number]);
if (oldIdx >= 0 && newIdx >= 0 && newIdx < oldIdx) {
  // Backward transition — check if allowed
  const allowed = BACKWARD_TRANSITIONS[newStatus];
  if (!allowed || !allowed.includes(oldStatus)) {
    console.error(
      `BLOCKED: ${ticketName} cannot move backward from ${oldStatus} to ${newStatus}. Allowed backward transitions to ${newStatus}: ${allowed?.join(", ") ?? "none"}`,
    );
    process.exit(1);
  }
  console.log(`  (backward transition: ${oldStatus} → ${newStatus})`);
}

// Check if demo statuses are valid for this ticket type
if (DEMO_STATUSES.has(newStatus) && !isFeatTicket(ticketName)) {
  console.error(
    `BLOCKED: ${ticketName} is not a feat ticket — demo statuses are only for feat tickets`,
  );
  process.exit(1);
}

// Run validation gates
let errors: string[] = [];

switch (newStatus) {
  case "readyForDev":
    errors = validateReadyForDev(content, ticketName);
    break;
  case "inTesting":
    errors = validateInTesting();
    break;
  case "validatingDemo":
    errors = validateValidatingDemo(ticketPath);
    break;
  case "demoValidated":
    errors = validateDemoValidated(ticketPath);
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
