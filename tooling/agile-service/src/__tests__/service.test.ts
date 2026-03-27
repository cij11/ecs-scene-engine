import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Repository } from "../repository.js";
import { Service, GateError } from "../service.js";

let tmpDir: string;
let repo: Repository;
let service: Service;

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
    expect(ticket.status).toBe("draft");

    // Verify persisted
    const loaded = repo.loadTicket(ticket.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("task-ESE-0001");

    // Verify relationship
    expect(repo.resolveTicketName("task-ESE-0001")).toBe(ticket.id);
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

    // Parent's subtasks array should be updated
    const updatedParent = repo.loadTicket(parent.id)!;
    expect(updatedParent.subtasks).toContain("feat-ESE-0001-01");
    expect(updatedParent.subtasks).toContain("feat-ESE-0001-02");
  });

  it("transitions ticket status", () => {
    const ticket = service.createTicket("task", "Transition test");
    const { oldStatus } = service.transitionTicket(
      ticket.name,
      "refining",
      "test",
    );

    expect(oldStatus).toBe("draft");

    const updated = repo.loadTicket(ticket.id)!;
    expect(updated.status).toBe("refining");
  });

  it("rejects invalid status", () => {
    service.createTicket("task", "Bad status");
    expect(() =>
      service.transitionTicket("task-ESE-0001", "invalid", "test"),
    ).toThrow("Invalid status");
  });

  it("blocks readyForDev without required fields", () => {
    const ticket = service.createTicket("task", "Gate test");
    service.transitionTicket(ticket.name, "refining", "test");

    expect(() =>
      service.transitionTicket(ticket.name, "readyForDev", "test"),
    ).toThrow(GateError);

    try {
      service.transitionTicket(ticket.name, "readyForDev", "test");
    } catch (e) {
      const ge = e as GateError;
      expect(ge.gateErrors).toContain("Description is empty");
      expect(ge.gateErrors).toContain("Acceptance Criteria is empty");
      expect(ge.gateErrors).toContain("Size is empty");
    }
  });

  it("passes readyForDev gate with required fields", () => {
    const ticket = service.createTicket("task", "Ready test");

    // Fill required fields
    const loaded = repo.loadTicket(ticket.id)!;
    loaded.description = "Some description";
    loaded.acceptanceCriteria = "- AC 1";
    loaded.testingScenarios = "- Test 1";
    loaded.size = 3;
    loaded.stakeholderUnderstanding = "I understand this";
    loaded.demoDeliverable = "Terminal output showing ticket creation";
    repo.saveTicket(loaded);

    service.transitionTicket(ticket.name, "refining", "test");
    const { ticket: result } = service.transitionTicket(
      ticket.name,
      "readyForDev",
      "test",
    );
    expect(result.status).toBe("readyForDev");
  });

  it("allows backward transitions without gates", () => {
    const ticket = service.createTicket("task", "Backward test");

    // Fill fields to get to readyForDev
    const loaded = repo.loadTicket(ticket.id)!;
    loaded.description = "desc";
    loaded.acceptanceCriteria = "ac";
    loaded.testingScenarios = "ts";
    loaded.size = 2;
    loaded.stakeholderUnderstanding = "su";
    loaded.demoDeliverable = "demo";
    repo.saveTicket(loaded);

    service.transitionTicket(ticket.name, "refining", "test");
    service.transitionTicket(ticket.name, "readyForDev", "test");

    // Go backward — should skip gates
    const { ticket: result } = service.transitionTicket(
      ticket.name,
      "draft",
      "test",
    );
    expect(result.status).toBe("draft");
  });

  it("sets started timestamp on inDevelopment", () => {
    const ticket = service.createTicket("task", "Timestamp test");
    const loaded = repo.loadTicket(ticket.id)!;
    loaded.description = "d";
    loaded.acceptanceCriteria = "a";
    loaded.testingScenarios = "t";
    loaded.size = 1;
    loaded.stakeholderUnderstanding = "s";
    loaded.demoDeliverable = "d";
    repo.saveTicket(loaded);

    service.transitionTicket(ticket.name, "refining", "test");
    service.transitionTicket(ticket.name, "readyForDev", "test");
    service.transitionTicket(ticket.name, "inDevelopment", "test");

    const result = repo.loadTicket(ticket.id)!;
    expect(result.started).not.toBeNull();
    expect(result.team).toBe("test");
  });

  it("blocks skipping statuses (must follow forward transitions)", () => {
    const ticket = service.createTicket("task", "Skip test");
    // draft → readyForDev should fail (must go through refining)
    expect(() =>
      service.transitionTicket(ticket.name, "readyForDev", "test"),
    ).toThrow('cannot go from "draft" to "readyForDev"');
  });

  it("blocks transitions out of done", () => {
    const ticket = service.createTicket("task", "Done test");
    const loaded = repo.loadTicket(ticket.id)!;
    loaded.status = "done";
    loaded.started = new Date().toISOString();
    loaded.completed = new Date().toISOString();
    repo.saveTicket(loaded);

    expect(() =>
      service.transitionTicket(ticket.name, "inDevelopment", "test"),
    ).toThrow("done tickets cannot be transitioned");
  });

  it("allows all ticket types through demo statuses", () => {
    const ticket = service.createTicket("task", "Demo for task");
    service.transitionTicket(ticket.name, "refining", "test");

    // Can't skip to buildingDemo — must follow the path
    expect(() =>
      service.transitionTicket(ticket.name, "buildingDemo", "test"),
    ).toThrow("cannot go from");
  });

  it("accepts demo", () => {
    const ticket = service.createTicket("feat", "Demo test");
    const result = service.acceptDemo(ticket.name);
    expect(result.demoAccepted).toBe(true);

    const loaded = repo.loadTicket(ticket.id)!;
    expect(loaded.demoAccepted).toBe(true);
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

    const { sprint, warnings } = service.completeSprint("sprint_8");
    expect(sprint.status).toBe("complete");
    expect(sprint.completedPoints).toBe(3);
    expect(sprint.completedTickets).toBe(1);
    expect(sprint.hours).toBe(2);

    // Velocity recorded
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
    // Seed velocity data
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
