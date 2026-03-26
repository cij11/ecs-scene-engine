import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VELOCITY_PATH = path.join(AGILE_DIR, "sprints", "velocity.csv");

if (!fs.existsSync(VELOCITY_PATH)) {
  console.log("No velocity data yet. Complete a sprint first.");
  process.exit(0);
}

const content = fs.readFileSync(VELOCITY_PATH, "utf-8");
const lines = content.trim().split("\n");
const header = lines[0]!;
const rows = lines.slice(1).filter(l => l.trim());

if (rows.length === 0) {
  console.log("No velocity data yet. Complete a sprint first.");
  process.exit(0);
}

console.log("\n=== Velocity Report ===\n");
console.log(header);
console.log("-".repeat(80));

let totalPoints = 0;
let totalHours = 0;

for (const row of rows) {
  console.log(row);
  const parts = row.split(",");
  totalPoints += parseInt(parts[1]!, 10) || 0;
  totalHours += parseFloat(parts[5]!) || 0;
}

console.log("-".repeat(80));
console.log(`\nSprints completed: ${rows.length}`);
console.log(`Total points delivered: ${totalPoints}`);
console.log(`Total hours: ${Math.round(totalHours * 100) / 100}`);

if (rows.length > 0) {
  const avgPoints = Math.round((totalPoints / rows.length) * 10) / 10;
  const avgHours = Math.round((totalHours / rows.length) * 100) / 100;
  const pointsPerHour = totalHours > 0 ? Math.round((totalPoints / totalHours) * 100) / 100 : 0;
  console.log(`\nAvg points/sprint: ${avgPoints}`);
  console.log(`Avg hours/sprint: ${avgHours}`);
  console.log(`Points/hour: ${pointsPerHour}`);
}
