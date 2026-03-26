import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");

function usage(): never {
  console.error("Usage: npx tsx process/agile/automation/create-sprint.ts <sprint_name>");
  console.error("  e.g. npx tsx process/agile/automation/create-sprint.ts sprint_1_2026_03_25");
  process.exit(1);
}

const sprintName = process.argv[2];
if (!sprintName) usage();

const sprintDir = path.join(SPRINTS_DIR, sprintName);

if (fs.existsSync(sprintDir)) {
  console.error(`Error: sprint "${sprintName}" already exists.`);
  process.exit(1);
}

fs.mkdirSync(sprintDir, { recursive: true });

const sprintDoc = `## Sprint Goals\n\n## Tickets\n`;
fs.writeFileSync(path.join(sprintDir, `${sprintName}.md`), sprintDoc, "utf-8");

console.log(`Created sprint: ${sprintName}`);
