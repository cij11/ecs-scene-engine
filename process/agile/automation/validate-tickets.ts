/**
 * Validates that all ticket statuses match the audit log.
 *
 * If a ticket's status was changed outside of the automation
 * (manual edit), this script will detect the discrepancy.
 *
 * Also validates ticket structural correctness.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG_DIR = path.join(AGILE_DIR, "backlog");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");

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

const TICKET_STATUS_PATH = path.join(SPRINTS_DIR, "ticketStatus.json");

interface TicketStatusEntry {
  filename: string;
  status: string;
}

interface TicketStatusFile {
  tickets: TicketStatusEntry[];
}

function loadTicketStatus(): TicketStatusFile {
  if (!fs.existsSync(TICKET_STATUS_PATH)) return { tickets: [] };
  return JSON.parse(fs.readFileSync(TICKET_STATUS_PATH, "utf-8")) as TicketStatusFile;
}

function getRegistryStatus(statusData: TicketStatusFile, name: string): string | null {
  const entry = statusData.tickets.find((t) => t.filename.includes(name));
  return entry?.status ?? null;
}

function getSection(content: string, section: string): string {
  const regex = new RegExp(`^## ${section}\\n([\\s\\S]*?)(?=^## |$)`, "m");
  const match = content.match(regex);
  return match?.[1]?.trim() ?? "";
}

function findAllTickets(): { path: string; name: string }[] {
  const tickets: { path: string; name: string }[] = [];

  if (fs.existsSync(BACKLOG_DIR)) {
    for (const f of fs.readdirSync(BACKLOG_DIR)) {
      if (f.match(/^(?:feat|bugfix|task)-ESE-/) && f.endsWith(".md")) {
        tickets.push({ path: path.join(BACKLOG_DIR, f), name: f.replace(".md", "") });
      }
    }
  }

  if (fs.existsSync(SPRINTS_DIR)) {
    for (const dir of fs.readdirSync(SPRINTS_DIR, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name === "archived") continue;
      const sprintDir = path.join(SPRINTS_DIR, dir.name);
      for (const f of fs.readdirSync(sprintDir)) {
        if (f.match(/^(?:feat|bugfix|task)-ESE-/) && f.endsWith(".md")) {
          tickets.push({ path: path.join(sprintDir, f), name: f.replace(".md", "") });
        }
      }
    }
  }

  return tickets;
}

// --- Main ---

const statusData = loadTicketStatus();
const tickets = findAllTickets();
const errors: string[] = [];
const warnings: string[] = [];

for (const { path: ticketPath, name } of tickets) {
  const content = fs.readFileSync(ticketPath, "utf-8");
  const fileStatus = getSection(content, "Status");

  // Check ticketStatus.json match
  const registryStatus = getRegistryStatus(statusData, name);
  if (registryStatus && registryStatus !== fileStatus) {
    errors.push(
      `${name}: file says "${fileStatus}" but ticketStatus.json says "${registryStatus}" — ticket status was modified outside automation`,
    );
  }

  if (!registryStatus && fileStatus !== "draft") {
    warnings.push(
      `${name}: status is "${fileStatus}" but not found in ticketStatus.json — may predate the status registry`,
    );
  }

  // Check structural correctness
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(`## ${section}`)) {
      errors.push(`${name}: missing section ## ${section}`);
    }
  }
}

// Report
if (errors.length === 0 && warnings.length === 0) {
  console.log(`All ${tickets.length} tickets validated. No issues found.`);
  process.exit(0);
}

if (warnings.length > 0) {
  console.warn(`Warnings:`);
  for (const w of warnings) console.warn(`  WARN: ${w}`);
}

if (errors.length > 0) {
  console.error(`Errors:`);
  for (const e of errors) console.error(`  ERROR: ${e}`);
  process.exit(1);
}
