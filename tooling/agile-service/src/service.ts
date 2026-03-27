import * as fs from "node:fs";
import { execSync } from "node:child_process";
import type { Ticket, ExitCriteriaResult, Sprint, VelocityEntry } from "./types.js";
import type { Repository } from "./repository.js";
import { exitRefinement, exitReview, exitDone } from "./exit-criteria.js";

export class Service {
  constructor(
    private readonly repo: Repository,
    private readonly projectRoot: string,
  ) {}

  // --- Ticket commands ---

  createTicket(type: "feat" | "bugfix" | "task", title: string, parentName?: string): Ticket {
    this.repo.ensureDirectories();

    let name: string;
    if (parentName) {
      const subNum = this.repo.getNextSubtaskNumber(parentName);
      name = `${parentName}-${subNum}`;
    } else {
      const num = this.repo.getNextTicketNumber(type);
      name = `${type}-ESE-${num}`;
    }

    const ticket: Ticket = {
      id: this.repo.generateId(),
      name,
      type,
      title,
      status: "refinement",
      description: "",
      acceptanceCriteria: "",
      demoDeliverable: "",
      testingScenarios: "",
      testingNotes: "",
      size: null,
      sizeLabel: null,
      subtasks: [],
      stakeholderUnderstanding: "",
      demoAccepted: false,
      team: "",
      started: null,
      completed: null,
      blockers: "",
      knowledgeGaps: "",
      comments: "",
      parentName: parentName ?? null,
      sprintName: null,
    };

    this.repo.saveTicket(ticket);

    // Update parent's subtasks array
    if (parentName) {
      const parent = this.repo.loadTicketByName(parentName);
      if (parent && !parent.subtasks.includes(name)) {
        parent.subtasks.push(name);
        this.repo.saveTicket(parent);
      }
    }

    // Auto-create story directory and story file
    this.ensureStoryDir(ticket);

    return ticket;
  }

  transitionTicket(
    name: string,
    newStatus: string,
    team?: string,
  ): { ticket: Ticket; oldStatus: string } {
    const ticket = this.resolveTicket(name);
    const config = this.repo.getStatusesConfig();
    const teamId = team ?? process.env.CLAUDE_SESSION_ID ?? "unknown";

    // Validate status exists
    const statusNames = config.statuses.map((s) => s.name);
    if (!statusNames.includes(newStatus)) {
      throw new Error(`Invalid status "${newStatus}". Must be one of: ${statusNames.join(", ")}`);
    }

    // Block transitions out of done
    const oldStatus = ticket.status;
    if (oldStatus === "done") {
      throw new Error(`${ticket.name} is done — done tickets cannot be transitioned`);
    }

    const oldIdx = statusNames.indexOf(oldStatus);
    const newIdx = statusNames.indexOf(newStatus);
    const isBackward = oldIdx >= 0 && newIdx >= 0 && newIdx < oldIdx;

    // Forward transitions must follow the allowed path
    if (!isBackward) {
      const oldStatusDef = config.statuses.find((s) => s.name === oldStatus);
      if (oldStatusDef && !oldStatusDef.forwardTransitions.includes(newStatus)) {
        const allowed = oldStatusDef.forwardTransitions.join(", ");
        throw new Error(
          `${ticket.name} cannot go from "${oldStatus}" to "${newStatus}". Next: ${allowed || "none"}`,
        );
      }

      const exitResult = this.checkExitCriteria(oldStatus, ticket);
      if (!exitResult.passed) {
        throw new ExitCriteriaError(ticket.name, newStatus, exitResult.errors);
      }
    }

    // Apply transition
    ticket.status = newStatus;

    const now = new Date().toISOString();

    if (newStatus === "dev" && !ticket.started) {
      ticket.started = now;
    }
    if (newStatus === "dev") {
      ticket.team = teamId;
    }
    if (newStatus === "done" && !ticket.completed) {
      ticket.completed = now;
    }

    this.repo.saveTicket(ticket);

    // Audit log
    this.repo.appendAudit({
      timestamp: now,
      ticket: ticket.name,
      from: oldStatus,
      to: newStatus,
      team: teamId,
    });

    return { ticket, oldStatus };
  }

  acceptDemo(name: string): Ticket {
    const ticket = this.resolveTicket(name);
    if (ticket.status !== "humanValidatingDemo") {
      throw new Error(
        `${ticket.name} is in "${ticket.status}", not "humanValidatingDemo" — demo cannot be accepted yet`,
      );
    }
    ticket.demoAccepted = true;
    this.repo.saveTicket(ticket);
    // Accepting the demo transitions to done
    const { ticket: done } = this.transitionTicket(name, "done");
    return done;
  }

  validateTickets(): { errors: string[]; warnings: string[] } {
    const tickets = this.repo.loadAllTickets();
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const ticket of tickets) {
      // Check required fields exist
      if (!ticket.id) errors.push(`${ticket.name}: missing id`);
      if (!ticket.name) errors.push(`${ticket.name ?? "unknown"}: missing name`);
      if (!ticket.type) errors.push(`${ticket.name}: missing type`);

      // Check subtask references
      for (const subName of ticket.subtasks) {
        const sub = this.repo.loadTicketByName(subName);
        if (!sub) {
          warnings.push(`${ticket.name}: subtask "${subName}" not found`);
        }
      }
    }

    return { errors, warnings };
  }

  private static readonly UPDATABLE_FIELDS: ReadonlySet<string> = new Set([
    "title",
    "description",
    "acceptanceCriteria",
    "demoDeliverable",
    "testingScenarios",
    "testingNotes",
    "size",
    "sizeLabel",
    "stakeholderUnderstanding",
    "blockers",
    "knowledgeGaps",
    "comments",
    "team",
  ]);

  updateTicket(name: string, field: string, value: string): Ticket {
    if (!Service.UPDATABLE_FIELDS.has(field)) {
      throw new Error(
        `Cannot update field "${field}". Updatable fields: ${[...Service.UPDATABLE_FIELDS].join(", ")}`,
      );
    }
    const ticket = this.resolveTicket(name);

    if (field === "size") {
      const num = Number(value);
      (ticket as unknown as Record<string, unknown>)[field] = isNaN(num) ? null : num;
    } else {
      (ticket as unknown as Record<string, unknown>)[field] = value;
    }

    this.repo.saveTicket(ticket);
    return ticket;
  }

  listTickets(): Ticket[] {
    return this.repo.loadAllTickets();
  }

  getTicket(name: string): Ticket {
    return this.resolveTicket(name);
  }

  // --- Sprint commands ---

  createSprint(name: string): Sprint {
    const existing = this.repo.findSprint(name);
    if (existing) {
      throw new Error(`Sprint "${name}" already exists.`);
    }

    const sprint: Sprint = {
      name,
      status: "planning",
      ticketNames: [],
      totalPoints: 0,
      completedPoints: 0,
      totalTickets: 0,
      completedTickets: 0,
      hours: 0,
      startedAt: null,
      completedAt: null,
    };

    const data = this.repo.loadSprints();
    data.sprints.push(sprint);
    this.repo.saveSprints(data);

    return sprint;
  }

  addToSprint(ticketName: string, sprintName: string): void {
    const ticket = this.resolveTicket(ticketName);
    const sprint = this.repo.findSprint(sprintName);
    if (!sprint) {
      throw new Error(`Sprint "${sprintName}" not found.`);
    }

    if (sprint.ticketNames.includes(ticketName)) {
      // Idempotent — ensure ticket's sprintName is set even if already in array
      if (!ticket.sprintName) {
        ticket.sprintName = sprintName;
        this.repo.saveTicket(ticket);
      }
      return;
    }

    // Update ticket
    ticket.sprintName = sprintName;
    this.repo.saveTicket(ticket);

    // Update sprint
    sprint.ticketNames.push(ticketName);
    const data = this.repo.loadSprints();
    const idx = data.sprints.findIndex((s) => s.name === sprintName);
    data.sprints[idx] = sprint;
    this.repo.saveSprints(data);

    // Also add subtasks
    const allTickets = this.repo.loadAllTickets();
    const subtasks = allTickets.filter((t) => t.parentName === ticketName);
    for (const sub of subtasks) {
      if (!sprint.ticketNames.includes(sub.name)) {
        sub.sprintName = sprintName;
        this.repo.saveTicket(sub);
        sprint.ticketNames.push(sub.name);
      }
    }

    // Save again with subtasks
    data.sprints[idx] = sprint;
    this.repo.saveSprints(data);
  }

  startSprint(sprintName: string): Sprint {
    const data = this.repo.loadSprints();
    const sprint = data.sprints.find((s) => s.name === sprintName);
    if (!sprint) {
      throw new Error(`Sprint "${sprintName}" not found.`);
    }

    if (sprint.status !== "planning") {
      throw new Error(`Sprint "${sprintName}" is "${sprint.status}", not "planning".`);
    }

    // Calculate total points from tickets
    let totalPoints = 0;
    let ticketCount = 0;

    for (const ticketName of sprint.ticketNames) {
      const ticket = this.resolveTicketSafe(ticketName);
      if (!ticket) continue;

      // Skip parent tickets whose size comes from subtasks
      if (ticket.sizeLabel?.startsWith("Sum of subtasks")) continue;

      if (ticket.size !== null && !isNaN(ticket.size)) {
        totalPoints += ticket.size;
      }
      ticketCount++;
    }

    sprint.status = "active";
    sprint.totalPoints = totalPoints;
    sprint.totalTickets = ticketCount;
    sprint.startedAt = new Date().toISOString();

    const idx = data.sprints.findIndex((s) => s.name === sprintName);
    data.sprints[idx] = sprint;
    this.repo.saveSprints(data);

    return sprint;
  }

  completeSprint(sprintName: string): {
    sprint: Sprint;
    warnings: string[];
  } {
    const data = this.repo.loadSprints();
    const sprint = data.sprints.find((s) => s.name === sprintName);
    if (!sprint) {
      throw new Error(`Sprint "${sprintName}" not found.`);
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Calculate actuals from ticket JSON
    let completedPoints = 0;
    let completedCount = 0;
    let totalPoints = 0;
    let totalCount = 0;
    let totalHours = 0;
    const incompleteTickets: string[] = [];

    for (const ticketName of sprint.ticketNames) {
      const ticket = this.resolveTicketSafe(ticketName);
      if (!ticket) continue;

      // Skip parent tickets
      if (ticket.sizeLabel?.startsWith("Sum of subtasks")) continue;

      const points = ticket.size ?? 0;
      totalCount++;
      totalPoints += points;

      if (ticket.status === "done") {
        completedCount++;
        completedPoints += points;
      } else {
        incompleteTickets.push(`${ticket.name} (${ticket.status})`);
      }

      // Calculate hours
      if (ticket.started && ticket.completed) {
        const started = new Date(ticket.started);
        const completed = new Date(ticket.completed);
        if (!isNaN(started.getTime()) && !isNaN(completed.getTime())) {
          totalHours += (completed.getTime() - started.getTime()) / (1000 * 60 * 60);
        }
      }
    }

    // Exit criteria: must have tickets with points
    if (totalCount === 0) {
      errors.push("No tickets with story points found — velocity cannot be calculated");
    }

    if (errors.length > 0) {
      throw new ExitCriteriaError(sprintName, "complete", errors);
    }

    // Warnings
    if (incompleteTickets.length > 0) {
      warnings.push(`Incomplete tickets: ${incompleteTickets.join(", ")}`);
    }
    if (completedPoints === 0 && completedCount === 0) {
      warnings.push("No tickets completed — sprint velocity will be 0");
    }

    // Apply
    const actualHours = Math.round(totalHours * 100) / 100;

    sprint.status = "complete";
    sprint.completedPoints = completedPoints;
    sprint.completedTickets = completedCount;
    sprint.totalPoints = totalPoints;
    sprint.totalTickets = totalCount;
    sprint.hours = actualHours;
    sprint.completedAt = new Date().toISOString();

    const idx = data.sprints.findIndex((s) => s.name === sprintName);
    data.sprints[idx] = sprint;
    this.repo.saveSprints(data);

    // Append velocity
    const velocityEntry: VelocityEntry = {
      sprint: sprintName,
      completedPoints,
      totalPoints,
      completedTickets: completedCount,
      totalTickets: totalCount,
      hours: actualHours,
    };
    this.repo.appendVelocity(velocityEntry);

    return { sprint, warnings };
  }

  velocityReport(): {
    entries: VelocityEntry[];
    totalPoints: number;
    totalHours: number;
    avgPointsPerSprint: number;
    avgHoursPerSprint: number;
    pointsPerHour: number;
  } {
    const data = this.repo.loadVelocity();
    const entries = data.entries;

    let totalPoints = 0;
    let totalHours = 0;

    for (const e of entries) {
      totalPoints += e.completedPoints;
      totalHours += e.hours;
    }

    const count = entries.length || 1;

    return {
      entries,
      totalPoints,
      totalHours: Math.round(totalHours * 100) / 100,
      avgPointsPerSprint: Math.round((totalPoints / count) * 10) / 10,
      avgHoursPerSprint: Math.round((totalHours / count) * 100) / 100,
      pointsPerHour: totalHours > 0 ? Math.round((totalPoints / totalHours) * 100) / 100 : 0,
    };
  }

  returnToBacklog(ticketName: string, sprintName: string): void {
    const ticket = this.resolveTicket(ticketName);
    const data = this.repo.loadSprints();
    const sprint = data.sprints.find((s) => s.name === sprintName);
    if (!sprint) {
      throw new Error(`Sprint "${sprintName}" not found.`);
    }

    // Remove from sprint
    sprint.ticketNames = sprint.ticketNames.filter((n) => n !== ticketName);
    ticket.sprintName = null;
    this.repo.saveTicket(ticket);

    // Also remove subtasks
    const allTickets = this.repo.loadAllTickets();
    const subtasks = allTickets.filter((t) => t.parentName === ticketName);
    for (const sub of subtasks) {
      sprint.ticketNames = sprint.ticketNames.filter((n) => n !== sub.name);
      sub.sprintName = null;
      this.repo.saveTicket(sub);
    }

    const idx = data.sprints.findIndex((s) => s.name === sprintName);
    data.sprints[idx] = sprint;
    this.repo.saveSprints(data);
  }

  sumPoints(parentName: string): number {
    const allTickets = this.repo.loadAllTickets();
    const parent = allTickets.find((t) => t.name === parentName);
    if (!parent) {
      throw new Error(`Ticket "${parentName}" not found.`);
    }

    const total = this.sumRecursive(parentName, allTickets);

    parent.sizeLabel = `Sum of subtasks (${total})`;
    parent.size = total;
    this.repo.saveTicket(parent);

    return total;
  }

  demoInit(name: string, description: string, durationMs: number): string {
    const ticket = this.resolveTicket(name);
    const sprintDir = this.getStoryDir(ticket);
    if (!sprintDir) {
      throw new Error(`Ticket "${name}" is not in a sprint.`);
    }

    const demoDir = `${sprintDir}/demo`;
    fs.mkdirSync(demoDir, { recursive: true });

    const expectedPath = `${demoDir}/demo-expected.json`;
    fs.writeFileSync(
      expectedPath,
      JSON.stringify({ description, durationMs }, null, 2) + "\n",
      "utf-8",
    );

    return demoDir;
  }

  demoCapture(name: string, artifactName: string, command: string): string {
    const ticket = this.resolveTicket(name);
    const sprintDir = this.getStoryDir(ticket);
    if (!sprintDir) {
      throw new Error(`Ticket "${name}" is not in a sprint.`);
    }

    const demoDir = `${sprintDir}/demo`;
    if (!fs.existsSync(demoDir)) {
      throw new Error(`Demo directory not found. Run demo-init first.`);
    }

    let output: string;
    try {
      output = execSync(command, {
        cwd: this.projectRoot,
        encoding: "utf-8",
      }) as string;
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string };
      output = (err.stdout ?? "") + (err.stderr ?? "");
    }

    const artifactPath = `${demoDir}/${artifactName}`;
    fs.writeFileSync(artifactPath, output, "utf-8");

    return artifactPath;
  }

  demoFinish(name: string, artifactType: "video" | "terminal", command: string): string {
    const ticket = this.resolveTicket(name);
    const sprintDir = this.getStoryDir(ticket);
    if (!sprintDir) {
      throw new Error(`Ticket "${name}" is not in a sprint.`);
    }

    const demoDir = `${sprintDir}/demo`;
    if (!fs.existsSync(demoDir)) {
      throw new Error(`Demo directory not found.`);
    }

    // Scan for artifact files (exclude JSON config files)
    const artifacts = fs
      .readdirSync(demoDir)
      .filter(
        (f: string) => (!f.startsWith("demo-") && !f.endsWith(".json")) || f.startsWith("artifact"),
      )
      .filter((f: string) => !f.startsWith("demo-"));

    const readmePath = `${demoDir}/demo-readme.json`;
    fs.writeFileSync(
      readmePath,
      JSON.stringify({ command, artifactType, artifacts }, null, 2) + "\n",
      "utf-8",
    );

    return readmePath;
  }

  generateValidateDemoPrompt(name: string): string {
    const ticket = this.resolveTicket(name);
    const sprintDir = this.getStoryDir(ticket);
    if (!sprintDir) {
      throw new Error(`Ticket "${name}" is not in a sprint — no demo directory.`);
    }

    const demoDir = `${sprintDir}/demo`;
    const expectedPath = `${demoDir}/demo-expected.json`;
    const readmePath = `${demoDir}/demo-readme.json`;

    if (!fs.existsSync(expectedPath)) {
      throw new Error("Missing demo-expected.json");
    }
    if (!fs.existsSync(readmePath)) {
      throw new Error("Missing demo-readme.json");
    }

    const expected = fs.readFileSync(expectedPath, "utf-8");
    const readme = JSON.parse(fs.readFileSync(readmePath, "utf-8"));

    const artifactContents: { file: string; content: string }[] = [];
    for (const artifactFile of readme.artifacts ?? []) {
      const artifactPath = `${demoDir}/${artifactFile}`;
      if (!fs.existsSync(artifactPath)) {
        throw new Error(`Missing artifact file: ${artifactFile}`);
      }
      artifactContents.push({
        file: artifactFile,
        content: fs.readFileSync(artifactPath, "utf-8"),
      });
    }

    const actualPath = `${demoDir}/demo-actual.json`;

    let prompt = `You are a demo validation agent. You have NO context about how this software was built.\n\n`;
    prompt += `Your job is to review demo artifacts and determine if they match the expected demo.\n\n`;
    prompt += `## demo-expected.json\n\`\`\`json\n${expected}\`\`\`\n\n`;
    prompt += `## demo-readme.json\n\`\`\`json\n${JSON.stringify(readme, null, 2)}\n\`\`\`\n\n`;

    for (const { file, content } of artifactContents) {
      prompt += `## Artifact: ${file}\n\`\`\`\n${content}\`\`\`\n\n`;
    }

    prompt += `## Your task\n\n`;
    prompt += `Based ONLY on the artifacts above, write a JSON file to: ${actualPath}\n\n`;
    prompt += `The file must have this exact structure:\n`;
    prompt += `\`\`\`json\n`;
    prompt += `{\n`;
    prompt += `  "overallInterpretation": "your interpretation of what the demo shows",\n`;
    prompt += `  "artifacts": [\n`;
    prompt += `    { "file": "filename", "interpretation": "what this artifact shows" }\n`;
    prompt += `  ],\n`;
    prompt += `  "demoMatchesExpected": true or false,\n`;
    prompt += `  "allQuestionsAnswered": true or false,\n`;
    prompt += `  "validatedBy": "your agent id or session id"\n`;
    prompt += `}\n`;
    prompt += `\`\`\`\n\n`;
    prompt += `Set demoMatchesExpected to true ONLY if the artifacts demonstrate what demo-expected.json describes. Be honest.\n`;
    prompt += `Set validatedBy to a unique identifier for yourself.\n`;

    return prompt;
  }

  promoteSubtask(subtaskName: string): { oldName: string; newName: string } {
    const ticket = this.resolveTicket(subtaskName);

    if (!ticket.parentName) {
      throw new Error(`"${subtaskName}" is not a subtask — no parent found.`);
    }

    // Generate new top-level name
    const num = this.repo.getNextTicketNumber(ticket.type);
    const newName = `${ticket.type}-ESE-${num}`;

    // Update ticket (old file removed by saveTicket)
    const oldName = ticket.name;
    ticket.name = newName;
    ticket.title = ticket.title.replace(subtaskName, newName);
    ticket.parentName = null;
    this.repo.saveTicket(ticket);

    // Update parent's subtask list
    const parentMatch = subtaskName.match(/^((?:feat|bugfix|task)-ESE-\d{4})-\d{2}$/);
    if (parentMatch) {
      const parent = this.repo.loadTicketByName(parentMatch[1]!);
      if (parent) {
        parent.subtasks = parent.subtasks.filter((s) => s !== subtaskName);
        this.repo.saveTicket(parent);
      }
    }

    // Rename any child subtasks
    const allTickets = this.repo.loadAllTickets();
    for (const child of allTickets) {
      if (child.parentName === oldName) {
        const subNum = child.name.split("-").pop()!;
        const newChildName = `${newName}-${subNum}`;

        child.name = newChildName;
        child.parentName = newName;
        child.title = child.title.replace(child.name, newChildName);
        this.repo.saveTicket(child);
      }
    }

    return { oldName, newName };
  }

  // --- Private helpers ---

  private resolveTicket(name: string): Ticket {
    const ticket = this.repo.loadTicketByName(name);
    if (!ticket) {
      throw new Error(`Ticket "${name}" not found.`);
    }
    return ticket;
  }

  private resolveTicketSafe(name: string): Ticket | null {
    return this.repo.loadTicketByName(name);
  }

  private checkExitCriteria(currentStatus: string, ticket: Ticket): ExitCriteriaResult {
    const storyDir = this.getStoryDir(ticket);

    switch (currentStatus) {
      case "refinement":
        return exitRefinement(ticket);
      case "review":
        return exitReview(ticket, this.projectRoot, storyDir);
      case "done":
        return exitDone(ticket, this.repo.loadAllTickets(), this.projectRoot);
      default:
        return { passed: true, errors: [] };
    }
  }

  private getStoryDir(ticket: Ticket): string | null {
    const slug = ticket.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (ticket.parentName) {
      const parentSlug = ticket.parentName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      return `${this.projectRoot}/stories/${parentSlug}/${slug}`;
    }
    return `${this.projectRoot}/stories/${slug}`;
  }

  /**
   * Create the story directory and story file for a ticket.
   * Called automatically on ticket creation.
   */
  private ensureStoryDir(ticket: Ticket): void {
    const storyDir = this.getStoryDir(ticket);
    if (!storyDir) return;

    fs.mkdirSync(storyDir, { recursive: true });

    // Find the ticket filename for the relative import
    const ticketFilename = this.repo.ticketFilename(ticket);
    const slug = ticket.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const storyFile = `${storyDir}/${slug}.stories.ts`;

    if (!fs.existsSync(storyFile)) {
      const isSubtask = ticket.parentName !== null;
      const relPrefix = isSubtask ? "../../.." : "../..";
      const ticketsDir = "process/agile/tickets";
      const relPath = `${relPrefix}/${ticketsDir}/${ticketFilename}`;
      const sharedPath = isSubtask ? "../../_shared" : "../_shared";

      let title: string;
      if (ticket.parentName) {
        title = `Tickets/${ticket.parentName}/${ticket.name} ${ticket.title}`;
      } else {
        title = `Tickets/${ticket.name} ${ticket.title}`;
      }

      const content = `import ticket from "${relPath}";
import { renderTicket } from "${sharedPath}/ticket-renderer.js";

export default {
  title: "${title}",
  render: () => renderTicket(ticket),
};

export const Ticket = {};
`;
      fs.writeFileSync(storyFile, content, "utf-8");
    }
  }

  private sumRecursive(parentName: string, allTickets: Ticket[]): number {
    let total = 0;
    const children = allTickets.filter((t) => t.parentName === parentName);

    for (const child of children) {
      const grandchildren = allTickets.filter((t) => t.parentName === child.name);
      if (grandchildren.length > 0) {
        total += this.sumRecursive(child.name, allTickets);
      } else {
        total += child.size ?? 0;
      }
    }

    return total;
  }
}

export class ExitCriteriaError extends Error {
  constructor(
    public readonly ticketOrSprint: string,
    public readonly targetStatus: string,
    public readonly criteriaErrors: string[],
  ) {
    super(`BLOCKED: ${ticketOrSprint} cannot transition to ${targetStatus}`);
    this.name = "ExitCriteriaError";
  }
}
