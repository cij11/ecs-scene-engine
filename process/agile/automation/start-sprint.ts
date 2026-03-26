import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");
const CSV_PATH = path.join(SPRINTS_DIR, "sprints.csv");

function usage(): never {
  console.error("Usage: npx tsx process/agile/automation/start-sprint.ts <sprint>");
  console.error("  e.g. npx tsx process/agile/automation/start-sprint.ts sprint_1_2026_03_25");
  process.exit(1);
}

const sprintName = process.argv[2];
if (!sprintName) usage();

const sprintDir = path.join(SPRINTS_DIR, sprintName);
if (!fs.existsSync(sprintDir)) {
  console.error(`Error: sprint "${sprintName}" not found.`);
  process.exit(1);
}

// Check not already started
const csv = fs.readFileSync(CSV_PATH, "utf-8");
if (csv.includes(`${sprintName},`)) {
  console.error(`Error: sprint "${sprintName}" already exists in sprints.csv.`);
  process.exit(1);
}

// Sum points from tickets
const files = fs.readdirSync(sprintDir).filter(f => f.match(/^(?:feat|bugfix|task)-ESE-/) && f.endsWith(".md"));

let totalPoints = 0;
let ticketCount = 0;

for (const file of files) {
  const content = fs.readFileSync(path.join(sprintDir, file), "utf-8");
  const sizeMatch = content.match(/^## Size\n(.+)$/m);
  if (!sizeMatch) continue;

  const val = sizeMatch[1]!.trim();

  // Skip parent tickets whose size is "Sum of subtasks (N)" — subtasks carry the points
  if (val.startsWith("Sum of subtasks")) continue;

  const num = parseInt(val, 10);
  if (!isNaN(num)) {
    totalPoints += num;
  }
  ticketCount++;
}

// Build pipe-delimited ticket list
const ticketNames = files.map(f => f.replace(".md", "")).join("|");

const row = `${sprintName},active,${ticketNames},${totalPoints},`;
fs.appendFileSync(CSV_PATH, row + "\n", "utf-8");

console.log(`Sprint "${sprintName}" started: ${files.length} tickets, ${totalPoints} story points.`);
