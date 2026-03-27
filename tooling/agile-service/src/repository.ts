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

  saveTicket(ticket: Ticket): void {
    const filePath = path.join(this.ticketsDir, `${ticket.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(ticket, null, 2) + "\n", "utf-8");
  }

  loadTicket(id: string): Ticket | null {
    const filePath = path.join(this.ticketsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Ticket;
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
    const filePath = path.join(this.ticketsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
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
    const relationships = this.loadRelationships();
    const names = Object.keys(relationships);

    const topLevelNumbers = names
      .map((n) => {
        const match = n.match(/^(?:feat|bugfix|task)-ESE-(\d{4})$/);
        return match ? parseInt(match[1]!, 10) : 0;
      })
      .filter((n) => n > 0);

    const next =
      topLevelNumbers.length > 0 ? Math.max(...topLevelNumbers) + 1 : 1;
    return String(next).padStart(4, "0");
  }

  getNextSubtaskNumber(parentName: string): string {
    const relationships = this.loadRelationships();
    const prefix = `${parentName}-`;
    const subtaskNumbers = Object.keys(relationships)
      .filter((n) => n.startsWith(prefix))
      .map((n) => {
        const match = n.match(/-(\d{2})$/);
        return match ? parseInt(match[1]!, 10) : 0;
      });

    const next =
      subtaskNumbers.length > 0 ? Math.max(...subtaskNumbers) + 1 : 1;
    return String(next).padStart(2, "0");
  }
}
