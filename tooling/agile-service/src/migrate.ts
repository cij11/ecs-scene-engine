import * as fs from "node:fs";
import * as path from "node:path";
import type { Ticket } from "./types.js";
import type { Repository } from "./repository.js";

function getSection(content: string, section: string): string {
  const regex = new RegExp(`^## ${section}\\n\\n?([\\s\\S]*?)(?=^## |$)`, "m");
  const match = content.match(regex);
  return match?.[1]?.trim() ?? "";
}

function parseTicketType(name: string): "feat" | "bugfix" | "task" {
  if (name.startsWith("feat-")) return "feat";
  if (name.startsWith("bugfix-")) return "bugfix";
  return "task";
}

function parseSize(
  raw: string,
): { size: number | null; sizeLabel: string | null } {
  if (!raw) return { size: null, sizeLabel: null };
  if (raw.startsWith("Sum of subtasks")) {
    const match = raw.match(/\((\d+)\)/);
    const num = match ? parseInt(match[1]!, 10) : null;
    return { size: num, sizeLabel: raw };
  }
  const num = parseInt(raw, 10);
  return isNaN(num) ? { size: null, sizeLabel: null } : { size: num, sizeLabel: null };
}

function parseSubtasks(raw: string): string[] {
  if (!raw) return [];
  const matches = raw.match(/(?:feat|bugfix|task)-ESE-\d{4}(?:-\d{2})?/g);
  return matches ?? [];
}

function getParentName(name: string): string | null {
  const match = name.match(/^((?:feat|bugfix|task)-ESE-\d{4})-\d{2}$/);
  return match ? match[1]! : null;
}

function migrateMarkdownTicket(
  filePath: string,
  name: string,
  sprintName: string | null,
  repo: Repository,
): Ticket {
  const content = fs.readFileSync(filePath, "utf-8");
  const type = parseTicketType(name);
  const { size, sizeLabel } = parseSize(getSection(content, "Size"));
  const title = getSection(content, "Title").replace(/^.*?:\s*/, "");
  const started = getSection(content, "Started") || null;
  const completed = getSection(content, "Completed") || null;

  const ticket: Ticket = {
    id: repo.generateId(),
    name,
    type,
    title,
    status: getSection(content, "Status") || "draft",
    description: getSection(content, "Description"),
    acceptanceCriteria: getSection(content, "Acceptance Criteria"),
    demoDeliverable: getSection(content, "Demo Deliverable"),
    testingScenarios: getSection(content, "Testing Scenarios"),
    testingNotes: getSection(content, "Testing Notes"),
    size,
    sizeLabel,
    subtasks: parseSubtasks(getSection(content, "Subtasks")),
    stakeholderUnderstanding: getSection(content, "Stakeholder Understanding"),
    demoAccepted: false,
    team: getSection(content, "Team"),
    started,
    completed,
    blockers: getSection(content, "Blockers"),
    knowledgeGaps: getSection(content, "Knowledge Gaps"),
    comments: getSection(content, "Comments"),
    parentName: getParentName(name),
    sprintName,
  };

  return ticket;
}

export function runMigration(repo: Repository, dataDir: string): void {
  repo.ensureDirectories();

  const backlogDir = path.join(dataDir, "backlog");
  const sprintsDir = path.join(dataDir, "sprints");

  const ticketPattern = /^(feat|bugfix|task)-ESE-\d{4}(?:-\d{2})?\.md$/;
  const migrated: string[] = [];

  // Check for existing migration
  const relationships = repo.loadRelationships();
  if (Object.keys(relationships).length > 0) {
    console.log("ticket_id_relationships.json already has entries.");
    console.log("Re-running migration will skip existing tickets.");
  }

  // Migrate backlog tickets
  if (fs.existsSync(backlogDir)) {
    const files = fs.readdirSync(backlogDir).filter((f) => ticketPattern.test(f));
    for (const file of files) {
      const name = file.replace(".md", "");
      if (relationships[name]) {
        console.log(`  SKIP ${name} (already migrated)`);
        continue;
      }
      const ticket = migrateMarkdownTicket(
        path.join(backlogDir, file),
        name,
        null,
        repo,
      );
      repo.saveTicket(ticket);
      relationships[name] = ticket.id;
      migrated.push(name);
      console.log(`  OK   ${name} → ${ticket.id}`);
    }
  }

  // Migrate sprint tickets
  if (fs.existsSync(sprintsDir)) {
    const sprintDirs = fs
      .readdirSync(sprintsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "archived");

    for (const dir of sprintDirs) {
      const sprintPath = path.join(sprintsDir, dir.name);
      const files = fs.readdirSync(sprintPath).filter((f) => ticketPattern.test(f));
      for (const file of files) {
        const name = file.replace(".md", "");
        if (relationships[name]) {
          console.log(`  SKIP ${name} (already migrated)`);
          continue;
        }
        const ticket = migrateMarkdownTicket(
          path.join(sprintPath, file),
          name,
          dir.name,
          repo,
        );
        repo.saveTicket(ticket);
        relationships[name] = ticket.id;
        migrated.push(name);
        console.log(`  OK   ${name} → ${ticket.id}`);
      }
    }
  }

  // Also pull demoAccepted from ticketStatus.json if it exists
  const ticketStatusPath = path.join(sprintsDir, "ticketStatus.json");
  if (fs.existsSync(ticketStatusPath)) {
    const statusData = JSON.parse(fs.readFileSync(ticketStatusPath, "utf-8"));
    for (const entry of statusData.tickets ?? []) {
      const nameMatch = entry.filename.match(
        /((?:feat|bugfix|task)-ESE-\d{4}(?:-\d{2})?)/,
      );
      if (!nameMatch) continue;
      const name = nameMatch[1]!;
      const id = relationships[name];
      if (!id) continue;
      const ticket = repo.loadTicket(id);
      if (!ticket) continue;

      // Use status from ticketStatus.json as authoritative
      if (entry.status) {
        ticket.status = entry.status;
      }
      if (entry.demoAccepted) {
        ticket.demoAccepted = true;
      }
      repo.saveTicket(ticket);
    }
    console.log("\nApplied statuses from ticketStatus.json.");
  }

  repo.saveRelationships(relationships);

  console.log(`\nMigration complete: ${migrated.length} tickets migrated.`);
  console.log("Ticket JSON files: process/agile/tickets/");
  console.log("Relationships: process/agile/ticket_id_relationships.json");
}
