/**
 * Accept a demo — sets demoAccepted: true in ticketStatus.json.
 * Intended to be run by a human stakeholder, not by an agent.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AGILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPRINTS_DIR = path.join(AGILE_DIR, "sprints");
const TICKET_STATUS_PATH = path.join(SPRINTS_DIR, "ticketStatus.json");

const ticketName = process.argv[2];
if (!ticketName) {
  console.error("Usage: npm run ticket:accept -- <ticket>");
  process.exit(1);
}

if (!fs.existsSync(TICKET_STATUS_PATH)) {
  console.error("Error: ticketStatus.json not found.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(TICKET_STATUS_PATH, "utf-8"));
const entry = data.tickets.find((t: { filename: string }) => t.filename.includes(ticketName));

if (!entry) {
  console.error(`Error: ticket "${ticketName}" not found in ticketStatus.json.`);
  process.exit(1);
}

entry.demoAccepted = true;
fs.writeFileSync(TICKET_STATUS_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
console.log(`Demo accepted for ${ticketName}.`);
