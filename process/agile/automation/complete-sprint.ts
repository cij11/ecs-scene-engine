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

// Read tickets in the sprint
const files = fs.readdirSync(sprintDir).filter(f => f.match(/^(?:feat|bugfix|task)-ESE-/) && f.endsWith(".md"));

let completedPoints = 0;
let totalPoints = 0;
let completedCount = 0;
let totalCount = 0;
let totalHours = 0;

for (const file of files) {
  const content = fs.readFileSync(path.join(sprintDir, file), "utf-8");

  const sizeMatch = content.match(/^## Size\n(.+)$/m);
  if (!sizeMatch) continue;
  const val = sizeMatch[1]!.trim();
  if (val.startsWith("Sum of subtasks")) continue;

  const points = parseInt(val, 10);
  if (isNaN(points)) continue;

  totalCount++;
  totalPoints += points;

  const statusMatch = content.match(/^## Status\n(.+)$/m);
  const status = statusMatch?.[1]?.trim();

  if (status === "done") {
    completedCount++;
    completedPoints += points;
  }

  // Calculate hours from Started/Completed timestamps
  const startedMatch = content.match(/^## Started\n(.+)$/m);
  const completedMatch = content.match(/^## Completed\n(.+)$/m);

  if (startedMatch?.[1]?.trim() && completedMatch?.[1]?.trim()) {
    const started = new Date(startedMatch[1]!.trim());
    const completed = new Date(completedMatch[1]!.trim());
    const hours = (completed.getTime() - started.getTime()) / (1000 * 60 * 60);
    totalHours += hours;
  }
}

const actualHours = Math.round(totalHours * 100) / 100;

// Update sprints.csv — set status to complete and fill in hours
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
