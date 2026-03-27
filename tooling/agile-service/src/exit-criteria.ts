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

/** Exit criteria for readyForDev: all required fields must be filled. */
export function exitInRefinement(ticket: Ticket): ExitCriteriaResult {
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
    errors.push(
      "Stakeholder Understanding is empty — stakeholder must explain the ticket back",
    );
  }

  if (!ticket.demoDeliverable) {
    errors.push(
      "Demo Deliverable is empty — all tickets must define what the demo should show",
    );
  }

  return errors.length > 0 ? fail(errors) : pass();
}

/** Exit criteria for inTesting: CI must pass. */
export function exitInTesting(
  _ticket: Ticket,
  projectRoot: string,
): ExitCriteriaResult {
  const errors: string[] = [];

  try {
    execSync("npm run ci", { cwd: projectRoot, stdio: "pipe" });
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    const output =
      (err.stdout?.toString() ?? "") + "\n" + (err.stderr?.toString() ?? "");
    const firstError =
      output
        .split("\n")
        .find(
          (l: string) =>
            l.includes("FAIL") || l.includes("error") || l.includes("Error"),
        ) ?? "unknown error";
    errors.push(`CI pipeline failed: ${firstError.trim()}`);
  }

  return errors.length > 0 ? fail(errors) : pass();
}

/** Exit criteria for inReview: review.md must exist with no critical/severe issues. */
export function exitInReview(sprintDir: string | null): ExitCriteriaResult {
  const errors: string[] = [];

  if (!sprintDir) {
    return pass();
  }

  const reviewPath = path.join(sprintDir, "review.md");
  if (!fs.existsSync(reviewPath)) {
    errors.push("Missing review.md — code review must be documented before proceeding");
    return fail(errors);
  }

  const review = fs.readFileSync(reviewPath, "utf-8").toLowerCase();
  if (review.includes("critical")) {
    errors.push("review.md contains critical issues — must be resolved before proceeding");
  }
  if (review.includes("severe")) {
    errors.push("review.md contains severe issues — must be resolved before proceeding");
  }

  return errors.length > 0 ? fail(errors) : pass();
}

/** Exit criteria for buildingDemo: demo artifacts must be present. */
export function exitBuildingDemo(
  _ticket: Ticket,
  sprintDir: string | null,
): ExitCriteriaResult {
  const errors: string[] = [];

  if (!sprintDir) {
    errors.push("Ticket is not in a sprint — cannot build demo");
    return fail(errors);
  }

  const demoDir = path.join(sprintDir, "demo");

  if (!fs.existsSync(demoDir)) {
    errors.push(`Missing demo/ directory at ${demoDir}`);
    return fail(errors);
  }

  const expectedPath = path.join(demoDir, "demo-expected.json");
  if (!fs.existsSync(expectedPath)) {
    errors.push("Missing demo-expected.json — must contain description and durationMs");
  } else {
    try {
      const expected = JSON.parse(fs.readFileSync(expectedPath, "utf-8"));
      if (!expected.description) errors.push("demo-expected.json: missing description");
      if (!expected.durationMs) errors.push("demo-expected.json: missing durationMs");
    } catch {
      errors.push("demo-expected.json: invalid JSON");
    }
  }

  const readmePath = path.join(demoDir, "demo-readme.json");
  if (!fs.existsSync(readmePath)) {
    errors.push("Missing demo-readme.json — must contain command, artifactType, artifacts");
  } else {
    try {
      const readme = JSON.parse(fs.readFileSync(readmePath, "utf-8"));
      if (!readme.command) errors.push("demo-readme.json: missing command");
      if (!readme.artifactType) {
        errors.push("demo-readme.json: missing artifactType (\"video\" or \"terminal\")");
      } else if (!["video", "terminal"].includes(readme.artifactType)) {
        errors.push("demo-readme.json: artifactType must be \"video\" or \"terminal\"");
      }
      if (!Array.isArray(readme.artifacts) || readme.artifacts.length === 0) {
        errors.push("demo-readme.json: missing or empty artifacts array");
      }
    } catch {
      errors.push("demo-readme.json: invalid JSON");
    }
  }

  return errors.length > 0 ? fail(errors) : pass();
}

/** Exit criteria for validatingDemo: demo-actual.json must have interpretations and validatedBy. */
export function exitValidatingDemo(
  _ticket: Ticket,
  sprintDir: string | null,
): ExitCriteriaResult {
  const errors: string[] = [];

  if (!sprintDir) {
    errors.push("Ticket is not in a sprint");
    return fail(errors);
  }

  const demoDir = path.join(sprintDir, "demo");
  const actualPath = path.join(demoDir, "demo-actual.json");

  if (!fs.existsSync(actualPath)) {
    errors.push("Missing demo-actual.json — run 'npm run agile -- ticket validate-demo <name>'");
    return fail(errors);
  }

  try {
    const actual = JSON.parse(fs.readFileSync(actualPath, "utf-8"));

    if (!actual.overallInterpretation) {
      errors.push("demo-actual.json: missing overallInterpretation");
    }

    if (!Array.isArray(actual.artifacts) || actual.artifacts.length === 0) {
      errors.push("demo-actual.json: missing or empty artifacts array");
    } else {
      for (let i = 0; i < actual.artifacts.length; i++) {
        const artifact = actual.artifacts[i];
        if (!artifact.interpretation) {
          errors.push(`demo-actual.json: artifact ${i} missing interpretation`);
        }
      }
    }

    if (!actual.demoMatchesExpected) {
      errors.push("demo-actual.json: demoMatchesExpected must be true");
    }

    if (!actual.allQuestionsAnswered) {
      errors.push("demo-actual.json: allQuestionsAnswered must be true");
    }

    if (!actual.validatedBy) {
      errors.push("demo-actual.json: missing validatedBy — must be validated by context-free agent");
    }
  } catch {
    errors.push("demo-actual.json: invalid JSON");
  }

  return errors.length > 0 ? fail(errors) : pass();
}

/** Exit criteria for done: CI, timestamps, demoAccepted (human interactive), subtasks done. */
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
    errors.push("Size is empty — velocity cannot be calculated");
  }

  // CI must pass
  try {
    execSync("npm run ci", { cwd: projectRoot, stdio: "pipe" });
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    const output =
      (err.stdout?.toString() ?? "") + "\n" + (err.stderr?.toString() ?? "");
    const firstError =
      output
        .split("\n")
        .find(
          (l: string) =>
            l.includes("FAIL") || l.includes("error") || l.includes("Error"),
        ) ?? "unknown error";
    errors.push(`CI pipeline failed: ${firstError.trim()}`);
  }

  // All tickets must have accepted demo (human-only interactive confirmation)
  if (!ticket.demoAccepted) {
    errors.push(
      `demoAccepted is not true — run 'npm run agile -- ticket accept ${ticket.name}'`,
    );
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
