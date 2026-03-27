import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type {
  Ticket,
  TicketIdRelationship,
  SprintsData,
  VelocityData,
  VelocityEntry,
  AuditEntry,
  StatusesConfig,
  Sprint,
} from "./types.js";

export class Repository {
  private readonly dataDir: string;
  private readonly ticketsDir: string;
  private readonly relationshipsPath: string;
  private readonly sprintsPath: string;
  private readonly velocityPath: string;
  private readonly auditLogPath: string;
  private readonly statusesConfig: StatusesConfig;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.ticketsDir = path.join(dataDir, "tickets");
    this.relationshipsPath = path.join(dataDir, "ticket_id_relationships.json");
    this.sprintsPath = path.join(dataDir, "sprints.json");
    this.velocityPath = path.join(dataDir, "velocity.json");
    this.auditLogPath = path.join(dataDir, "audit-log.jsonl");

    const statusesPath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "statuses.json",
    );
    this.statusesConfig = JSON.parse(
      fs.readFileSync(statusesPath, "utf-8"),
    ) as StatusesConfig;
  }

  // --- Init ---

  ensureDirectories(): void {
    fs.mkdirSync(this.ticketsDir, { recursive: true });
  }

  // --- Statuses ---

  getStatusesConfig(): StatusesConfig {
    return this.statusesConfig;
  }

  // --- Tickets ---

  generateId(): string {
    return crypto.randomUUID();
  }

  ticketFilename(ticket: Ticket): string {
    const slug = this.slugify(ticket.title);
    return slug ? `${ticket.name}-${slug}.json` : `${ticket.name}.json`;
  }

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
  }

  saveTicket(ticket: Ticket): void {
    // Remove old file if name/title changed (different filename)
    this.removeTicketFileByName(ticket.name);
    const filePath = path.join(this.ticketsDir, this.ticketFilename(ticket));
    fs.writeFileSync(filePath, JSON.stringify(ticket, null, 2) + "\n", "utf-8");
  }

  loadTicket(id: string): Ticket | null {
    // Scan files for matching UUID
    if (!fs.existsSync(this.ticketsDir)) return null;
    for (const f of fs.readdirSync(this.ticketsDir)) {
      if (!f.endsWith(".json")) continue;
      const content = fs.readFileSync(
        path.join(this.ticketsDir, f),
        "utf-8",
      );
      const ticket = JSON.parse(content) as Ticket;
      if (ticket.id === id) return ticket;
    }
    return null;
  }

  loadTicketByName(name: string): Ticket | null {
    if (!fs.existsSync(this.ticketsDir)) return null;
    for (const f of fs.readdirSync(this.ticketsDir)) {
      if (!f.endsWith(".json")) continue;
      // Match: name-slug.json or name.json, but NOT name-01-slug.json (subtask)
      if (f === `${name}.json` || this.filenameMatchesName(f, name)) {
        const content = fs.readFileSync(
          path.join(this.ticketsDir, f),
          "utf-8",
        );
        return JSON.parse(content) as Ticket;
      }
    }
    return null;
  }

  private filenameMatchesName(filename: string, name: string): boolean {
    // filename is e.g. "task-ESE-0001-some-slug.json"
    // name is e.g. "task-ESE-0001"
    // Must match the name prefix followed by a slug (lowercase letter), not a subtask number (digit)
    const withoutExt = filename.replace(/\.json$/, "");
    if (!withoutExt.startsWith(`${name}-`)) return false;
    const rest = withoutExt.slice(name.length + 1);
    // Slug starts with a letter; subtask number starts with a digit
    return rest.length > 0 && /^[a-z]/.test(rest);
  }

  loadAllTickets(): Ticket[] {
    if (!fs.existsSync(this.ticketsDir)) return [];
    return fs
      .readdirSync(this.ticketsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const content = fs.readFileSync(
          path.join(this.ticketsDir, f),
          "utf-8",
        );
        return JSON.parse(content) as Ticket;
      });
  }

  deleteTicket(id: string): boolean {
    if (!fs.existsSync(this.ticketsDir)) return false;
    for (const f of fs.readdirSync(this.ticketsDir)) {
      if (!f.endsWith(".json")) continue;
      const content = fs.readFileSync(
        path.join(this.ticketsDir, f),
        "utf-8",
      );
      const ticket = JSON.parse(content) as Ticket;
      if (ticket.id === id) {
        fs.unlinkSync(path.join(this.ticketsDir, f));
        return true;
      }
    }
    return false;
  }

  private removeTicketFileByName(name: string): void {
    if (!fs.existsSync(this.ticketsDir)) return;
    for (const f of fs.readdirSync(this.ticketsDir)) {
      if (!f.endsWith(".json")) continue;
      if (f === `${name}.json` || this.filenameMatchesName(f, name)) {
        fs.unlinkSync(path.join(this.ticketsDir, f));
        return;
      }
    }
  }

  // --- Ticket ID Relationships ---

  loadRelationships(): TicketIdRelationship {
    if (!fs.existsSync(this.relationshipsPath)) return {};
    return JSON.parse(
      fs.readFileSync(this.relationshipsPath, "utf-8"),
    ) as TicketIdRelationship;
  }

  saveRelationships(data: TicketIdRelationship): void {
    fs.writeFileSync(
      this.relationshipsPath,
      JSON.stringify(data, null, 2) + "\n",
      "utf-8",
    );
  }

  resolveTicketName(name: string): string | null {
    const relationships = this.loadRelationships();
    return relationships[name] ?? null;
  }

  // --- Sprints ---

  loadSprints(): SprintsData {
    if (!fs.existsSync(this.sprintsPath)) return { sprints: [] };
    return JSON.parse(
      fs.readFileSync(this.sprintsPath, "utf-8"),
    ) as SprintsData;
  }

  saveSprints(data: SprintsData): void {
    fs.writeFileSync(
      this.sprintsPath,
      JSON.stringify(data, null, 2) + "\n",
      "utf-8",
    );
  }

  findSprint(name: string): Sprint | null {
    const data = this.loadSprints();
    return data.sprints.find((s) => s.name === name) ?? null;
  }

  // --- Velocity ---

  loadVelocity(): VelocityData {
    if (!fs.existsSync(this.velocityPath)) return { entries: [] };
    return JSON.parse(
      fs.readFileSync(this.velocityPath, "utf-8"),
    ) as VelocityData;
  }

  saveVelocity(data: VelocityData): void {
    fs.writeFileSync(
      this.velocityPath,
      JSON.stringify(data, null, 2) + "\n",
      "utf-8",
    );
  }

  appendVelocity(entry: VelocityEntry): void {
    const data = this.loadVelocity();
    data.entries.push(entry);
    this.saveVelocity(data);
  }

  // --- Audit Log ---

  appendAudit(entry: AuditEntry): void {
    fs.appendFileSync(
      this.auditLogPath,
      JSON.stringify(entry) + "\n",
      "utf-8",
    );
  }

  // --- Next ticket number ---

  getNextTicketNumber(type: string): string {
    const tickets = this.loadAllTickets();
    const topLevelNumbers = tickets
      .map((t) => {
        const match = t.name.match(/^(?:feat|bugfix|task)-ESE-(\d{4})$/);
        return match ? parseInt(match[1]!, 10) : 0;
      })
      .filter((n) => n > 0);

    const next =
      topLevelNumbers.length > 0 ? Math.max(...topLevelNumbers) + 1 : 1;
    return String(next).padStart(4, "0");
  }

  getNextSubtaskNumber(parentName: string): string {
    const tickets = this.loadAllTickets();
    const prefix = `${parentName}-`;
    const subtaskNumbers = tickets
      .filter((t) => t.name.startsWith(prefix))
      .map((t) => {
        const match = t.name.match(/-(\d{2})$/);
        return match ? parseInt(match[1]!, 10) : 0;
      });

    const next =
      subtaskNumbers.length > 0 ? Math.max(...subtaskNumbers) + 1 : 1;
    return String(next).padStart(2, "0");
  }
}
