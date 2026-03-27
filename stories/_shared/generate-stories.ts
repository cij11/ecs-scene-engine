/**
 * Generate Storybook story files from ticket JSON files.
 *
 * Usage: npx tsx stories/_shared/generate-stories.ts
 *
 * Scans process/agile/tickets/*.json and creates a .stories.ts file
 * for each ticket in stories/<ticket-name>/.
 * Subtasks nest under their parent's directory.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const TICKETS_DIR = "process/agile/tickets";
const STORIES_DIR = "stories";

interface TicketJson {
  name: string;
  title: string;
  parentName: string | null;
  [key: string]: unknown;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function storyTitle(ticket: TicketJson): string {
  if (ticket.parentName) {
    return `Tickets/${ticket.parentName}/${ticket.name} ${ticket.title}`;
  }
  return `Tickets/${ticket.name} ${ticket.title}`;
}

function generateStoryFile(ticket: TicketJson, ticketFilename: string): string {
  // Compute relative path depth based on nesting
  const isSubtask = ticket.parentName !== null;
  const relPrefix = isSubtask ? "../../.." : "../..";
  const relPath = `${relPrefix}/${TICKETS_DIR}/${ticketFilename}`;
  const sharedPath = isSubtask ? "../../_shared" : "../_shared";

  const title = storyTitle(ticket);

  return `import ticket from "${relPath}";
import { renderTicket } from "${sharedPath}/ticket-renderer.js";

export default {
  title: "${title}",
  render: () => renderTicket(ticket),
};

export const Ticket = {};
`;
}

function main() {
  const ticketFiles = fs
    .readdirSync(TICKETS_DIR)
    .filter((f) => f.endsWith(".json"));

  // Load all tickets
  const tickets: { file: string; data: TicketJson }[] = [];
  for (const f of ticketFiles) {
    const data = JSON.parse(
      fs.readFileSync(path.join(TICKETS_DIR, f), "utf-8"),
    ) as TicketJson;
    tickets.push({ file: f, data });
  }

  let created = 0;
  let skipped = 0;

  for (const { file, data } of tickets) {
    // Determine story directory
    let storyDir: string;
    if (data.parentName) {
      storyDir = path.join(STORIES_DIR, slugify(data.parentName), slugify(data.name));
    } else {
      storyDir = path.join(STORIES_DIR, slugify(data.name));
    }

    const storyFile = path.join(storyDir, `${slugify(data.name)}.stories.ts`);

    // Skip if story already exists
    if (fs.existsSync(storyFile)) {
      skipped++;
      continue;
    }

    fs.mkdirSync(storyDir, { recursive: true });
    fs.writeFileSync(storyFile, generateStoryFile(data, file), "utf-8");
    created++;
    console.log(`  Created: ${storyFile}`);
  }

  console.log(`\nDone. Created ${created} stories, skipped ${skipped} existing.`);
}

main();
