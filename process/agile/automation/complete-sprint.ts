import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");
const CSV_PATH = path.join(SPRINTS_DIR, "sprints.csv");
const VELOCITY_PATH = path.join(SPRINTS_DIR, "velocity.csv");

function usage(): never {
  console.error("Usage: npx tsx process/agile/automation/complete-sprint.ts <sprint>");
  console.error("  e.g. npx tsx process/agile/automation/complete-sprint.ts sprint_1_2026_03_25");
  process.exit(1);
}

const sprintName = process.argv[2];
if (!sprintName) usage();

const sprintDir = path.join(SPRINTS_DIR, sprintName);
if (!fs.existsSync(sprintDir)) {
  console.error(`Error: sprint "${sprintName}" not found.`);
  process.exit(1);
}

// --- Guard rails ---

const errors: string[] = [];

// Gate 1: Demo folder must exist with demo.md
const demoDir = path.join(sprintDir, "demo");
const demoDoc = path.join(demoDir, "demo.md");
if (!fs.existsSync(demoDir)) {
  errors.push("Missing demo/ folder — a demo must be prepared before closing the sprint");
}
if (!fs.existsSync(demoDoc)) {
  errors.push("Missing demo/demo.md — demo documentation is required");
}

// Gate 2: Demo must be accepted by stakeholder
if (fs.existsSync(demoDoc)) {
  const demoContent = fs.readFileSync(demoDoc, "utf-8");
  if (!demoContent.toLowerCase().includes("accepted")) {
    errors.push("Demo has not been accepted by stakeholder — demo.md must contain acceptance confirmation");
  }
}

// Gate 3: Check parent tickets for Demo Accepted field
const allTickets = fs.readdirSync(sprintDir).filter(f => f.match(/^(?:feat|bugfix|task)-ESE-\d{4}\.md$/));
let hasAcceptedDemo = false;
for (const file of allTickets) {
  const content = fs.readFileSync(path.join(sprintDir, file), "utf-8");
  const demoField = content.match(/^## Demo Accepted\n(.+)$/m);
  if (demoField?.[1]?.trim().toLowerCase().startsWith("accepted")) {
    hasAcceptedDemo = true;
    break;
  }
}
if (!hasAcceptedDemo) {
  errors.push("No ticket has 'Demo Accepted' marked as accepted by the stakeholder");
}

// Gate 4: Read tickets and validate
const files = fs.readdirSync(sprintDir).filter(f => f.match(/^(?:feat|bugfix|task)-ESE-/) && f.endsWith(".md"));

let completedPoints = 0;
let totalPoints = 0;
let completedCount = 0;
let totalCount = 0;
let totalHours = 0;
const incompleteTickets: string[] = [];
const missingSize: string[] = [];
const missingTimestamps: string[] = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(sprintDir, file), "utf-8");
  const ticketName = file.replace(".md", "");

  const sizeMatch = content.match(/^## Size\n(.+)$/m);
  const val = sizeMatch?.[1]?.trim();

  // Skip parent tickets (points come from subtasks)
  if (val?.startsWith("Sum of subtasks")) continue;

  const points = val ? parseInt(val, 10) : NaN;
  if (isNaN(points)) {
    missingSize.push(ticketName);
    continue;
  }

  totalCount++;
  totalPoints += points;

  const statusMatch = content.match(/^## Status\n(.+)$/m);
  const status = statusMatch?.[1]?.trim();

  if (status === "done") {
    completedCount++;
    completedPoints += points;
  } else {
    incompleteTickets.push(`${ticketName} (${status})`);
  }

  // Calculate hours from Started/Completed timestamps
  const startedMatch = content.match(/^## Started\n(.+)$/m);
  const completedMatch = content.match(/^## Completed\n(.+)$/m);

  if (startedMatch?.[1]?.trim() && completedMatch?.[1]?.trim()) {
    const started = new Date(startedMatch[1]!.trim());
    const completed = new Date(completedMatch[1]!.trim());
    if (!isNaN(started.getTime()) && !isNaN(completed.getTime())) {
      const hours = (completed.getTime() - started.getTime()) / (1000 * 60 * 60);
      totalHours += hours;
    } else {
      missingTimestamps.push(ticketName);
    }
  } else if (status === "done") {
    missingTimestamps.push(ticketName);
  }
}

// Gate 3: Must have tickets with points
if (totalCount === 0) {
  errors.push("No tickets with story points found — velocity cannot be calculated");
}

// Gate 4: Velocity data must not be zeroed
if (totalPoints === 0 && totalCount > 0) {
  errors.push("Total points is 0 — all tickets are missing size estimates");
}

// Warnings (non-blocking)
const warnings: string[] = [];

if (incompleteTickets.length > 0) {
  warnings.push(`Incomplete tickets: ${incompleteTickets.join(", ")}`);
  warnings.push("Consider returning incomplete tickets to backlog before closing");
}

if (missingSize.length > 0) {
  warnings.push(`Tickets missing size: ${missingSize.join(", ")}`);
}

if (missingTimestamps.length > 0) {
  warnings.push(`Done tickets missing Started/Completed timestamps: ${missingTimestamps.join(", ")}`);
  warnings.push("Hours will be inaccurate for these tickets");
}

if (completedPoints === 0 && completedCount === 0) {
  warnings.push("No tickets completed — sprint velocity will be 0");
}

// --- Report ---

if (errors.length > 0) {
  console.error(`BLOCKED: Sprint "${sprintName}" cannot be closed:`);
  for (const e of errors) console.error(`  ERROR: ${e}`);
  if (warnings.length > 0) {
    for (const w of warnings) console.error(`  WARN:  ${w}`);
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(`Warnings for sprint "${sprintName}":`);
  for (const w of warnings) console.warn(`  WARN: ${w}`);
  console.warn("");
}

// --- Apply ---

const actualHours = Math.round(totalHours * 100) / 100;

// Update sprints.csv
let csv = fs.readFileSync(CSV_PATH, "utf-8");
const lines = csv.split("\n");
const updatedLines = lines.map(line => {
  if (line.startsWith(`${sprintName},`)) {
    const parts = line.split(",");
    parts[1] = "complete";
    parts[parts.length - 1] = String(actualHours);
    return parts.join(",");
  }
  return line;
});
fs.writeFileSync(CSV_PATH, updatedLines.join("\n"), "utf-8");

// Append to velocity.csv
if (!fs.existsSync(VELOCITY_PATH)) {
  fs.writeFileSync(VELOCITY_PATH, "sprint,completed_points,total_points,completed_tickets,total_tickets,hours\n", "utf-8");
}
const velocityRow = `${sprintName},${completedPoints},${totalPoints},${completedCount},${totalCount},${actualHours}`;
fs.appendFileSync(VELOCITY_PATH, velocityRow + "\n", "utf-8");

console.log(`Sprint "${sprintName}" completed.`);
console.log(`  Tickets: ${completedCount}/${totalCount} done`);
console.log(`  Points:  ${completedPoints}/${totalPoints} completed`);
console.log(`  Hours:   ${actualHours}`);
console.log(`  Velocity: ${completedPoints} points in ${actualHours} hours`);
