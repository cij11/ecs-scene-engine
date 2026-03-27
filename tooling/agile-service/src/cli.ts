import * as path from "node:path";
import * as readline from "node:readline";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Repository } from "./repository.js";
import { Service, ExitCriteriaError } from "./service.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DATA_DIR = path.join(PROJECT_ROOT, "process", "agile");

const repo = new Repository(DATA_DIR);
const service = new Service(repo, PROJECT_ROOT);

const args = process.argv.slice(2);
const domain = args[0];
const action = args[1];

function usage(): never {
  console.error("Usage: npm run agile -- <domain> <action> [args]");
  console.error("");
  console.error("Status flow: refinement → dev → review → done");
  console.error("");
  console.error("Ticket commands:");
  console.error("  ticket create <type> <title> [parent]");
  console.error("  ticket update <name> <field> [value]");
  console.error("  ticket status <name> <status> [team]");
  console.error("  ticket accept <name>");
  console.error("  ticket validate");
  console.error("  ticket list");
  console.error("  ticket show <name>");
  console.error("  ticket points <parent>");
  console.error("  ticket promote <subtask>");
  console.error("  ticket validate-demo <name>");
  console.error("");
  console.error("Story commands:");
  console.error("  story generate              Regenerate stories from tickets");
  process.exit(1);
}

if (!domain || !action) usage();

function handleError(e: unknown): never {
  if (e instanceof ExitCriteriaError) {
    console.error(e.message + ":");
    for (const err of e.criteriaErrors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  if (e instanceof Error) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  throw e;
}

try {
  switch (domain) {
    case "ticket":
      handleTicket(action, args.slice(2));
      break;
    case "sprint":
      handleSprint(action, args.slice(2));
      break;
    case "migrate":
      handleMigrate(action).catch(handleError);
      break;
    case "story":
      handleStory(action);
      break;
    default:
      console.error(`Unknown domain: "${domain}". Use "ticket", "story", or "sprint".`);
      process.exit(1);
  }
} catch (e: unknown) {
  handleError(e);
}

function handleTicket(action: string, args: string[]): void {
  switch (action) {
    case "create": {
      const type = args[0] as "feat" | "bugfix" | "task";
      const title = args[1];
      const parent = args[2];
      if (!type || !title) {
        console.error("Usage: ticket create <type> <title> [parent]");
        process.exit(1);
      }
      if (!["feat", "bugfix", "task"].includes(type)) {
        console.error(`Type must be feat, bugfix, or task. Got "${type}".`);
        process.exit(1);
      }
      const ticket = service.createTicket(type, title, parent);
      console.log(`Created ${ticket.name} (${ticket.id})`);
      break;
    }

    case "update": {
      const name = args[0];
      const field = args[1];
      const value = args.slice(2).join(" ");
      if (!name || !field) {
        console.error("Usage: ticket update <name> <field> [value]");
        console.error("  Omit value to clear the field.");
        process.exit(1);
      }
      const updated = service.updateTicket(name, field, value);
      console.log(`${updated.name}: ${field} updated`);
      break;
    }

    case "status": {
      const name = args[0];
      const newStatus = args[1];
      const team = args[2];
      if (!name || !newStatus) {
        console.error("Usage: ticket status <name> <status> [team]");
        process.exit(1);
      }
      const { ticket, oldStatus } = service.transitionTicket(name, newStatus, team);
      console.log(`${ticket.name}: ${oldStatus} → ${newStatus}`);
      break;
    }

    case "accept": {
      const name = args[0];
      if (!name) {
        console.error("Usage: ticket accept <name>");
        process.exit(1);
      }
      if (!process.stdin.isTTY) {
        console.error("Error: ticket accept requires an interactive terminal.");
        process.exit(1);
      }
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(`Accept demo for ${name}? Type YES to confirm: `, (answer) => {
        rl.close();
        if (answer.trim() !== "YES") {
          console.error("Aborted — demo not accepted.");
          process.exit(1);
        }
        const ticket = service.acceptDemo(name);
        console.log(`Demo accepted for ${ticket.name}.`);
      });
      return; // async — don't fall through
    }

    case "validate": {
      const { errors, warnings } = service.validateTickets();
      const tickets = service.listTickets();

      if (warnings.length > 0) {
        console.warn("Warnings:");
        for (const w of warnings) console.warn(`  WARN: ${w}`);
      }
      if (errors.length > 0) {
        console.error("Errors:");
        for (const e of errors) console.error(`  ERROR: ${e}`);
        process.exit(1);
      }
      if (errors.length === 0 && warnings.length === 0) {
        console.log(`All ${tickets.length} tickets validated. No issues found.`);
      }
      break;
    }

    case "list": {
      const tickets = service.listTickets();
      if (tickets.length === 0) {
        console.log("No tickets found.");
        break;
      }
      const maxNameLen = Math.max(...tickets.map((t) => t.name.length));
      for (const t of tickets) {
        console.log(`  ${t.name.padEnd(maxNameLen)}  ${t.status.padEnd(20)}  ${t.title}`);
      }
      break;
    }

    case "show": {
      const name = args[0];
      if (!name) {
        console.error("Usage: ticket show <name>");
        process.exit(1);
      }
      const ticket = service.getTicket(name);
      console.log(JSON.stringify(ticket, null, 2));
      break;
    }

    case "points": {
      const parentName = args[0];
      if (!parentName) {
        console.error("Usage: ticket points <parent_ticket>");
        process.exit(1);
      }
      const total = service.sumPoints(parentName);
      console.log(`${parentName}: ${total} story points (recursive sum of subtasks)`);
      break;
    }

    case "demo-init": {
      const name = args[0];
      const description = args[1];
      const durationMs = args[2] ? parseInt(args[2], 10) : undefined;
      if (!name || !description || !durationMs) {
        console.error("Usage: ticket demo-init <name> <description> <durationMs>");
        process.exit(1);
      }
      const demoDir = service.demoInit(name, description, durationMs);
      console.log(`Demo initialized: ${demoDir}`);
      break;
    }

    case "demo-capture": {
      const name = args[0];
      const artifactName = args[1];
      const command = args.slice(2).join(" ");
      if (!name || !artifactName || !command) {
        console.error("Usage: ticket demo-capture <name> <artifact-name> <command...>");
        process.exit(1);
      }
      const artifactPath = service.demoCapture(name, artifactName, command);
      console.log(`Captured: ${artifactPath}`);
      break;
    }

    case "demo-finish": {
      const name = args[0];
      const artifactType = args[1] as "video" | "terminal";
      const command = args.slice(2).join(" ") || "see artifact files";
      if (!name || !artifactType) {
        console.error("Usage: ticket demo-finish <name> <video|terminal> [command-description]");
        process.exit(1);
      }
      if (!["video", "terminal"].includes(artifactType)) {
        console.error("artifactType must be 'video' or 'terminal'");
        process.exit(1);
      }
      const readmePath = service.demoFinish(name, artifactType, command);
      console.log(`Demo readme: ${readmePath}`);
      break;
    }

    case "validate-demo": {
      const name = args[0];
      if (!name) {
        console.error("Usage: ticket validate-demo <name>");
        process.exit(1);
      }
      const prompt = service.generateValidateDemoPrompt(name);
      console.log(prompt);
      break;
    }

    case "promote": {
      const subName = args[0];
      if (!subName) {
        console.error("Usage: ticket promote <subtask>");
        process.exit(1);
      }
      const { oldName, newName } = service.promoteSubtask(subName);
      console.log(`Promoted ${oldName} → ${newName}`);
      break;
    }

    default:
      console.error(
        `Unknown ticket action: "${action}". Use create, status, accept, validate, list, show, points, or promote.`,
      );
      process.exit(1);
  }
}

function handleSprint(action: string, args: string[]): void {
  switch (action) {
    case "create": {
      const name = args[0];
      if (!name) {
        console.error("Usage: sprint create <name>");
        process.exit(1);
      }
      const sprint = service.createSprint(name);
      console.log(`Created sprint: ${sprint.name}`);
      break;
    }

    case "add": {
      const ticketName = args[0];
      const sprintName = args[1];
      if (!ticketName || !sprintName) {
        console.error("Usage: sprint add <ticket> <sprint>");
        process.exit(1);
      }
      service.addToSprint(ticketName, sprintName);
      console.log(`Added ${ticketName} to ${sprintName}.`);
      break;
    }

    case "start": {
      const name = args[0];
      if (!name) {
        console.error("Usage: sprint start <sprint>");
        process.exit(1);
      }
      const sprint = service.startSprint(name);
      console.log(
        `Sprint "${sprint.name}" started: ${sprint.totalTickets} tickets, ${sprint.totalPoints} story points.`,
      );
      break;
    }

    case "complete": {
      const name = args[0];
      if (!name) {
        console.error("Usage: sprint complete <sprint>");
        process.exit(1);
      }
      const { sprint, warnings } = service.completeSprint(name);

      if (warnings.length > 0) {
        for (const w of warnings) console.warn(`  WARN: ${w}`);
        console.warn("");
      }

      console.log(`Sprint "${sprint.name}" completed.`);
      console.log(`  Tickets: ${sprint.completedTickets}/${sprint.totalTickets} done`);
      console.log(`  Points:  ${sprint.completedPoints}/${sprint.totalPoints} completed`);
      console.log(`  Hours:   ${sprint.hours}`);
      console.log(`  Velocity: ${sprint.completedPoints} points in ${sprint.hours} hours`);
      break;
    }

    case "return": {
      const ticketName = args[0];
      const sprintName = args[1];
      if (!ticketName || !sprintName) {
        console.error("Usage: sprint return <ticket> <sprint>");
        process.exit(1);
      }
      service.returnToBacklog(ticketName, sprintName);
      console.log(`Returned ${ticketName} to backlog.`);
      break;
    }

    case "velocity": {
      const report = service.velocityReport();

      if (report.entries.length === 0) {
        console.log("No velocity data yet. Complete a sprint first.");
        break;
      }

      console.log("\n=== Velocity Report ===\n");
      console.log("sprint,completed_points,total_points,completed_tickets,total_tickets,hours");
      console.log("-".repeat(80));

      for (const e of report.entries) {
        console.log(
          `${e.sprint},${e.completedPoints},${e.totalPoints},${e.completedTickets},${e.totalTickets},${e.hours}`,
        );
      }

      console.log("-".repeat(80));
      console.log(`\nSprints completed: ${report.entries.length}`);
      console.log(`Total points delivered: ${report.totalPoints}`);
      console.log(`Total hours: ${report.totalHours}`);
      console.log(`\nAvg points/sprint: ${report.avgPointsPerSprint}`);
      console.log(`Avg hours/sprint: ${report.avgHoursPerSprint}`);
      console.log(`Points/hour: ${report.pointsPerHour}`);
      break;
    }

    default:
      console.error(
        `Unknown sprint action: "${action}". Use create, add, start, complete, return, or velocity.`,
      );
      process.exit(1);
  }
}

function handleStory(action: string): void {
  switch (action) {
    case "generate": {
      execSync("npx tsx stories/_shared/generate-stories.ts", {
        cwd: PROJECT_ROOT,
        stdio: "inherit",
      });
      break;
    }
    default:
      console.error(`Unknown story action: "${action}". Use generate.`);
      process.exit(1);
  }
}

async function handleMigrate(action: string): Promise<void> {
  if (action !== "run") {
    console.error("Usage: migrate run");
    process.exit(1);
  }

  const m = await import("./migrate.js");
  m.runMigration(repo, DATA_DIR);
}
