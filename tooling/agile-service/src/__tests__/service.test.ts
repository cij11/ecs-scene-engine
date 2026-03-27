import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Repository } from "../repository.js";
import { Service, ExitCriteriaError } from "../service.js";

let tmpDir: string;
let repo: Repository;
let service: Service;

function makeReadyTicket(
  service: Service,
  repo: Repository,
  type: "feat" | "bugfix" | "task" = "task",
  title = "Ready ticket",
) {
  const ticket = service.createTicket(type, title);
  const loaded = repo.loadTicket(ticket.id)!;
  loaded.description = "desc";
  loaded.acceptanceCriteria = "ac";
  loaded.testingScenarios = "ts";
  loaded.size = 3;
  loaded.stakeholderUnderstanding = "su";
  loaded.demoDeliverable = "demo";
  repo.saveTicket(loaded);
  // Transition through refinement exit criteria to dev
  service.transitionTicket(ticket.name, "dev", "test");
  return ticket;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agile-svc-test-"));
  repo = new Repository(tmpDir);
  service = new Service(repo, tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Service — ticket commands", () => {
  it("creates a ticket with UUID and registers name", () => {
    const ticket = service.createTicket("task", "Test ticket");

    expect(ticket.id).toBeTruthy();
    expect(ticket.name).toBe("task-ESE-0001");
    expect(ticket.type).toBe("task");
    expect(ticket.title).toBe("Test ticket");
    expect(ticket.status).toBe("refinement");

    const loaded = repo.loadTicket(ticket.id);
    expect(loaded).not.toBeNull();
    expect(repo.loadTicketByName("task-ESE-0001")?.id).toBe(ticket.id);
  });

  it("auto-increments ticket numbers", () => {
    const t1 = service.createTicket("feat", "First");
    const t2 = service.createTicket("task", "Second");
    const t3 = service.createTicket("bugfix", "Third");

    expect(t1.name).toBe("feat-ESE-0001");
    expect(t2.name).toBe("task-ESE-0002");
    expect(t3.name).toBe("bugfix-ESE-0003");
  });

  it("creates subtasks under a parent and updates parent subtasks array", () => {
    const parent = service.createTicket("feat", "Parent");
    const sub1 = service.createTicket("feat", "Sub 1", parent.name);
    const sub2 = service.createTicket("feat", "Sub 2", parent.name);

    expect(sub1.name).toBe("feat-ESE-0001-01");
    expect(sub2.name).toBe("feat-ESE-0001-02");
    expect(sub1.parentName).toBe("feat-ESE-0001");

    const updatedParent = repo.loadTicket(parent.id)!;
    expect(updatedParent.subtasks).toContain("feat-ESE-0001-01");
    expect(updatedParent.subtasks).toContain("feat-ESE-0001-02");
  });

  it("transitions ticket status", () => {
    const ticket = makeReadyTicket(service, repo);
    // ticket is now in "dev" — transition to "review"
    const { oldStatus } = service.transitionTicket(ticket.name, "review", "test");

    expect(oldStatus).toBe("dev");
    const updated = repo.loadTicket(ticket.id)!;
    expect(updated.status).toBe("review");
  });

  it("rejects invalid status", () => {
    service.createTicket("task", "Bad status");
    expect(() => service.transitionTicket("task-ESE-0001", "invalid", "test")).toThrow(
      "Invalid status",
    );
  });

  it("blocks refinement exit without required fields", () => {
    const ticket = service.createTicket("task", "Exit criteria test");

    expect(() => service.transitionTicket(ticket.name, "dev", "test")).toThrow(ExitCriteriaError);

    try {
      service.transitionTicket(ticket.name, "dev", "test");
    } catch (e) {
      const ge = e as ExitCriteriaError;
      expect(ge.criteriaErrors).toContain("Description is empty");
      expect(ge.criteriaErrors).toContain("Acceptance Criteria is empty");
      expect(ge.criteriaErrors).toContain("Size is empty");
    }
  });

  it("passes refinement exit with required fields", () => {
    const ticket = makeReadyTicket(service, repo);
    // makeReadyTicket already transitions to dev
    const loaded = repo.loadTicket(ticket.id)!;
    expect(loaded.status).toBe("dev");
  });

  it("blocks skipping statuses (must follow forward transitions)", () => {
    const ticket = service.createTicket("task", "Skip test");
    // refinement → review should fail (must go through dev)
    const loaded = repo.loadTicket(ticket.id)!;
    loaded.description = "desc";
    loaded.acceptanceCriteria = "ac";
    loaded.testingScenarios = "ts";
    loaded.size = 3;
    loaded.stakeholderUnderstanding = "su";
    loaded.demoDeliverable = "demo";
    repo.saveTicket(loaded);

    expect(() => service.transitionTicket(ticket.name, "review", "test")).toThrow(
      'cannot go from "refinement" to "review"',
    );
  });

  it("blocks transitions out of done", () => {
    const ticket = service.createTicket("task", "Done test");
    const loaded = repo.loadTicket(ticket.id)!;
    loaded.status = "done";
    loaded.started = new Date().toISOString();
    loaded.completed = new Date().toISOString();
    repo.saveTicket(loaded);

    expect(() => service.transitionTicket(ticket.name, "dev", "test")).toThrow(
      "done tickets cannot be transitioned",
    );
  });

  it("allows backward transitions without exit criteria", () => {
    const ticket = makeReadyTicket(service, repo);
    // dev → refinement (backward) should work without exit criteria
    const { ticket: result } = service.transitionTicket(ticket.name, "refinement", "test");
    expect(result.status).toBe("refinement");
  });

  it("sets started timestamp on dev", () => {
    const ticket = makeReadyTicket(service, repo);

    const result = repo.loadTicket(ticket.id)!;
    expect(result.started).not.toBeNull();
    expect(result.team).toBe("test");
  });

  it("lists all tickets", () => {
    service.createTicket("task", "One");
    service.createTicket("feat", "Two");
    const list = service.listTickets();
    expect(list).toHaveLength(2);
  });

  it("validates tickets — clean state", () => {
    service.createTicket("task", "Valid");
    const { errors, warnings } = service.validateTickets();
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});

describe("Service — sprint commands", () => {
  it("creates a sprint", () => {
    const sprint = service.createSprint("sprint_8");
    expect(sprint.name).toBe("sprint_8");
    expect(sprint.status).toBe("planning");
  });

  it("rejects duplicate sprint", () => {
    service.createSprint("sprint_8");
    expect(() => service.createSprint("sprint_8")).toThrow("already exists");
  });

  it("adds ticket to sprint", () => {
    const ticket = service.createTicket("task", "Sprint ticket");
    service.createSprint("sprint_8");
    service.addToSprint(ticket.name, "sprint_8");

    const loaded = repo.loadTicket(ticket.id)!;
    expect(loaded.sprintName).toBe("sprint_8");

    const sprint = repo.findSprint("sprint_8")!;
    expect(sprint.ticketNames).toContain(ticket.name);
  });

  it("starts a sprint and calculates points", () => {
    service.createSprint("sprint_8");

    const t1 = service.createTicket("task", "T1");
    const loaded1 = repo.loadTicket(t1.id)!;
    loaded1.size = 3;
    repo.saveTicket(loaded1);

    const t2 = service.createTicket("task", "T2");
    const loaded2 = repo.loadTicket(t2.id)!;
    loaded2.size = 5;
    repo.saveTicket(loaded2);

    service.addToSprint(t1.name, "sprint_8");
    service.addToSprint(t2.name, "sprint_8");

    const sprint = service.startSprint("sprint_8");
    expect(sprint.status).toBe("active");
    expect(sprint.totalPoints).toBe(8);
    expect(sprint.totalTickets).toBe(2);
  });

  it("completes a sprint and records velocity", () => {
    service.createSprint("sprint_8");

    const t1 = service.createTicket("task", "Done ticket");
    const loaded1 = repo.loadTicket(t1.id)!;
    loaded1.size = 3;
    loaded1.status = "done";
    loaded1.started = "2026-03-26T10:00:00Z";
    loaded1.completed = "2026-03-26T12:00:00Z";
    loaded1.acceptanceCriteria = "ac";
    loaded1.demoAccepted = true;
    repo.saveTicket(loaded1);

    service.addToSprint(t1.name, "sprint_8");
    service.startSprint("sprint_8");

    const { sprint } = service.completeSprint("sprint_8");
    expect(sprint.status).toBe("complete");
    expect(sprint.completedPoints).toBe(3);
    expect(sprint.completedTickets).toBe(1);
    expect(sprint.hours).toBe(2);

    const velocity = repo.loadVelocity();
    expect(velocity.entries).toHaveLength(1);
    expect(velocity.entries[0]!.completedPoints).toBe(3);
  });

  it("returns ticket to backlog", () => {
    const ticket = service.createTicket("task", "Return me");
    service.createSprint("sprint_8");
    service.addToSprint(ticket.name, "sprint_8");

    service.returnToBacklog(ticket.name, "sprint_8");

    const loaded = repo.loadTicket(ticket.id)!;
    expect(loaded.sprintName).toBeNull();

    const sprint = repo.findSprint("sprint_8")!;
    expect(sprint.ticketNames).not.toContain(ticket.name);
  });

  it("generates velocity report", () => {
    repo.appendVelocity({
      sprint: "sprint_7",
      completedPoints: 3,
      totalPoints: 5,
      completedTickets: 1,
      totalTickets: 2,
      hours: 1.5,
    });

    const report = service.velocityReport();
    expect(report.entries).toHaveLength(1);
    expect(report.totalPoints).toBe(3);
    expect(report.totalHours).toBe(1.5);
    expect(report.pointsPerHour).toBe(2);
  });

  it("sums subtask points", () => {
    const parent = service.createTicket("feat", "Parent");
    const sub1 = service.createTicket("feat", "Sub 1", parent.name);
    const sub2 = service.createTicket("feat", "Sub 2", parent.name);

    const l1 = repo.loadTicket(sub1.id)!;
    l1.size = 3;
    repo.saveTicket(l1);

    const l2 = repo.loadTicket(sub2.id)!;
    l2.size = 5;
    repo.saveTicket(l2);

    const total = service.sumPoints(parent.name);
    expect(total).toBe(8);

    const loaded = repo.loadTicket(parent.id)!;
    expect(loaded.size).toBe(8);
    expect(loaded.sizeLabel).toBe("Sum of subtasks (8)");
  });
});

describe("Service — validate-demo prompt", () => {
  it("generates a self-contained prompt from demo artifacts", () => {
    const ticket = service.createTicket("task", "Demo prompt test");

    // Create demo directory at the story path
    const slug = ticket.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const storyDir = path.join(tmpDir, "stories", slug);
    const demoDir = path.join(storyDir, "demo");
    fs.mkdirSync(demoDir, { recursive: true });

    fs.writeFileSync(
      path.join(demoDir, "demo-expected.json"),
      JSON.stringify({ description: "Test demo", durationMs: 5000 }),
    );
    fs.writeFileSync(
      path.join(demoDir, "demo-readme.json"),
      JSON.stringify({
        command: "npm test",
        artifactType: "terminal",
        artifacts: ["output.txt"],
      }),
    );
    fs.writeFileSync(path.join(demoDir, "output.txt"), "test output here");

    const prompt = service.generateValidateDemoPrompt(ticket.name);

    // Prompt should contain artifact contents
    expect(prompt).toContain("test output here");
    expect(prompt).toContain("Test demo");
    expect(prompt).toContain("demo-actual.json");
    expect(prompt).toContain("validatedBy");

    // Prompt should NOT contain source paths or implementation details
    expect(prompt).not.toContain("service.ts");
    expect(prompt).not.toContain("exit-criteria.ts");
  });
});
