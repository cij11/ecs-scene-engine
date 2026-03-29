import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Repository } from "../repository.js";

let tmpDir: string;
let repo: Repository;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agile-test-"));
  repo = new Repository(tmpDir);
  repo.ensureDirectories();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Repository", () => {
  describe("tickets", () => {
    it("saves and loads a ticket", () => {
      const ticket = {
        id: repo.generateId(),
        name: "task-ESE-1",
        type: "task" as const,
        title: "Test ticket",
        stub: "test-ticket",
        tree: [1],
        status: "draft",
        description: "",
        acceptanceCriteria: "",
        demoDeliverable: "",
        testingScenarios: "",
        testingNotes: "",
        size: 3,
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
        parentName: null,
        sprintName: null,
      };

      repo.saveTicket(ticket);
      const loaded = repo.loadTicket(ticket.id);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(ticket.id);
      expect(loaded!.name).toBe("task-ESE-1");
      expect(loaded!.size).toBe(3);
    });

    it("returns null for missing ticket", () => {
      expect(repo.loadTicket("nonexistent")).toBeNull();
    });

    it("loads all tickets", () => {
      for (let i = 0; i < 3; i++) {
        repo.saveTicket({
          id: repo.generateId(),
          name: `task-ESE-${i + 1}`,
          type: "task",
          title: `Ticket ${i + 1}`,
          stub: `ticket-${i + 1}`,
          tree: [i + 1],
          status: "draft",
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
          parentName: null,
          sprintName: null,
        });
      }

      expect(repo.loadAllTickets()).toHaveLength(3);
    });

    it("deletes a ticket", () => {
      const id = repo.generateId();
      repo.saveTicket({
        id,
        name: "task-ESE-1",
        type: "task",
        title: "Delete me",
        stub: "delete-me",
        tree: [1],
        status: "draft",
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
        parentName: null,
        sprintName: null,
      });

      expect(repo.deleteTicket(id)).toBe(true);
      expect(repo.loadTicket(id)).toBeNull();
    });
  });

  describe("relationships", () => {
    it("saves and resolves ticket names", () => {
      const relationships = { "task-ESE-0001": "uuid-1", "feat-ESE-0002": "uuid-2" };
      repo.saveRelationships(relationships);

      expect(repo.resolveTicketName("task-ESE-0001")).toBe("uuid-1");
      expect(repo.resolveTicketName("feat-ESE-0002")).toBe("uuid-2");
      expect(repo.resolveTicketName("nonexistent")).toBeNull();
    });
  });

  describe("sprints", () => {
    it("saves and finds a sprint", () => {
      const data = {
        sprints: [
          {
            name: "sprint_8",
            status: "planning" as const,
            ticketNames: [],
            totalPoints: 0,
            completedPoints: 0,
            totalTickets: 0,
            completedTickets: 0,
            hours: 0,
            startedAt: null,
            completedAt: null,
          },
        ],
      };
      repo.saveSprints(data);

      const found = repo.findSprint("sprint_8");
      expect(found).not.toBeNull();
      expect(found!.name).toBe("sprint_8");
      expect(repo.findSprint("nonexistent")).toBeNull();
    });
  });

  describe("velocity", () => {
    it("appends and loads velocity entries", () => {
      repo.appendVelocity({
        sprint: "sprint_7",
        completedPoints: 3,
        totalPoints: 5,
        completedTickets: 1,
        totalTickets: 2,
        hours: 1.5,
      });
      repo.appendVelocity({
        sprint: "sprint_8",
        completedPoints: 5,
        totalPoints: 5,
        completedTickets: 2,
        totalTickets: 2,
        hours: 2.0,
      });

      const data = repo.loadVelocity();
      expect(data.entries).toHaveLength(2);
      expect(data.entries[0]!.sprint).toBe("sprint_7");
      expect(data.entries[1]!.completedPoints).toBe(5);
    });
  });

  describe("ticket numbering", () => {
    function saveStub(name: string, tree: number[], title = "stub") {
      repo.saveTicket({
        id: repo.generateId(), name, type: "task", title, stub: "stub", tree,
        status: "inRefinement",
        description: "", acceptanceCriteria: "", demoDeliverable: "",
        testingScenarios: "", testingNotes: "", size: null, sizeLabel: null,
        subtasks: [], stakeholderUnderstanding: "", demoAccepted: false,
        team: "", started: null, completed: null, blockers: "",
        knowledgeGaps: "", comments: "", parentName: null, sprintName: null,
      });
    }

    it("generates sequential ticket numbers", () => {
      saveStub("task-ESE-1", [1]);
      saveStub("feat-ESE-3", [3]);

      expect(repo.getNextTicketNumber()).toBe(4);
    });

    it("generates subtask numbers", () => {
      saveStub("task-ESE-1", [1]);
      saveStub("task-ESE-1-0", [1, 0]);
      saveStub("task-ESE-1-1", [1, 1]);

      expect(repo.getNextSubtaskNumber("task-ESE-1")).toBe(2);
    });

    it("starts at 0 for first subtask", () => {
      saveStub("task-ESE-1", [1]);
      expect(repo.getNextSubtaskNumber("task-ESE-1")).toBe(0);
    });
  });

  describe("audit log", () => {
    it("appends audit entries as JSONL", () => {
      repo.appendAudit({
        timestamp: "2026-03-27T00:00:00Z",
        ticket: "task-ESE-0001",
        from: "draft",
        to: "refining",
        team: "claude",
      });
      repo.appendAudit({
        timestamp: "2026-03-27T01:00:00Z",
        ticket: "task-ESE-0001",
        from: "refining",
        to: "readyForDev",
        team: "claude",
      });

      const content = fs.readFileSync(
        path.join(tmpDir, "audit-log.jsonl"),
        "utf-8",
      );
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!).to).toBe("refining");
      expect(JSON.parse(lines[1]!).to).toBe("readyForDev");
    });
  });
});
