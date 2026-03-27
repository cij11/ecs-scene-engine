import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Ticket, ExitCriteriaResult } from "./types.js";

function pass(): ExitCriteriaResult {
  return { passed: true, errors: [] };
}

function fail(errors: string[]): ExitCriteriaResult {
  return { passed: false, errors };
}

/** Exit criteria for refinement → dev: all required fields must be filled. */
export function exitRefinement(ticket: Ticket): ExitCriteriaResult {
  const errors: string[] = [];

  if (!ticket.description) errors.push("Description is empty");
  if (!ticket.acceptanceCriteria) errors.push("Acceptance Criteria is empty");
  if (!ticket.testingScenarios) errors.push("Testing Scenarios is empty");

  if (ticket.size === null && !ticket.sizeLabel) {
    errors.push("Size is empty");
  }

  if (
    ticket.size !== null &&
    isNaN(ticket.size) &&
    !ticket.sizeLabel?.startsWith("Sum of subtasks")
  ) {
    errors.push(`Size must be a number or 'Sum of subtasks (N)'`);
  }

  if (!ticket.stakeholderUnderstanding) {
    errors.push("Stakeholder Understanding is empty — stakeholder must explain the ticket back");
  }

  if (!ticket.demoDeliverable) {
    errors.push("Demo Deliverable is empty — all tickets must define what the demo should show");
  }

  return errors.length > 0 ? fail(errors) : pass();
}

/** Exit criteria for review → done: CI must pass, review.md must exist. */
export function exitReview(
  ticket: Ticket,
  projectRoot: string,
  storyDir: string | null,
): ExitCriteriaResult {
  const errors: string[] = [];

  // CI must pass
  try {
    execSync("npm run ci", { cwd: projectRoot, stdio: "pipe" });
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    const output = (err.stdout?.toString() ?? "") + "\n" + (err.stderr?.toString() ?? "");
    const firstError =
      output
        .split("\n")
        .find((l: string) => l.includes("FAIL") || l.includes("error") || l.includes("Error")) ??
      "unknown error";
    errors.push(`CI pipeline failed: ${firstError.trim()}`);
  }

  // review.md must exist in story directory
  if (storyDir) {
    const reviewPath = path.join(storyDir, "review.md");
    if (!fs.existsSync(reviewPath)) {
      errors.push("Missing review.md — code review must be documented before proceeding");
    } else {
      const review = fs.readFileSync(reviewPath, "utf-8").toLowerCase();
      if (review.includes("critical")) {
        errors.push("review.md contains critical issues — must be resolved before proceeding");
      }
      if (review.includes("severe")) {
        errors.push("review.md contains severe issues — must be resolved before proceeding");
      }
    }
  }

  // demo-actual.json must exist (context-free agent validation)
  if (storyDir) {
    const demoActualPath = path.join(storyDir, "demo-actual.json");
    if (!fs.existsSync(demoActualPath)) {
      errors.push("Missing demo-actual.json — context-free agent must validate demo artifacts");
    } else {
      try {
        const actual = JSON.parse(fs.readFileSync(demoActualPath, "utf-8"));
        if (!actual.demoMatchesExpected) {
          errors.push("demo-actual.json: demoMatchesExpected is not true — demo validation failed");
        }
        if (!actual.validatedBy) {
          errors.push(
            "demo-actual.json: missing validatedBy — must be validated by context-free agent",
          );
        }
      } catch {
        errors.push("demo-actual.json: invalid JSON");
      }
    }
  }

  return errors.length > 0 ? fail(errors) : pass();
}

/** Exit criteria for done: timestamps and subtasks. */
export function exitDone(
  ticket: Ticket,
  allTickets: Ticket[],
  projectRoot: string,
): ExitCriteriaResult {
  const errors: string[] = [];

  if (!ticket.started) {
    errors.push("Started timestamp is empty — ticket was never started");
  }

  if (!ticket.acceptanceCriteria) {
    errors.push("Acceptance Criteria is empty — cannot verify done");
  }

  if (ticket.size === null && !ticket.sizeLabel) {
    errors.push("Size is empty — estimation data cannot be recorded");
  }

  // Subtasks must be done
  if (ticket.subtasks.length > 0) {
    for (const subName of ticket.subtasks) {
      const sub = allTickets.find((t) => t.name === subName);
      if (sub && sub.status !== "done") {
        errors.push(`Subtask ${subName} is "${sub.status}", not done`);
      }
    }
  }

  return errors.length > 0 ? fail(errors) : pass();
}
