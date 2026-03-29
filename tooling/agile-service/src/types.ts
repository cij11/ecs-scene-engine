export interface Ticket {
  id: string; // UUID, immutable
  name: string; // e.g. "feat-ESE-10" or "feat-ESE-10-0" — derived from type + tree
  type: "feat" | "bugfix" | "task";
  title: string; // long form title
  stub: string; // short form title (for lists, filenames, etc.)
  tree: number[]; // ticket tree path, e.g. [10] or [10, 0] for subtask 0 of ticket 10
  status: string;
  description: string; // markdown
  acceptanceCriteria: string; // markdown
  demoDeliverable: string; // markdown
  testingScenarios: string; // markdown
  testingNotes: string; // markdown
  size: number | null;
  sizeLabel: string | null; // e.g. "Sum of subtasks (8)"
  subtasks: string[]; // ticket names
  stakeholderUnderstanding: string; // markdown
  demoAccepted: boolean;
  team: string;
  started: string | null; // ISO timestamp
  completed: string | null; // ISO timestamp
  blockers: string; // markdown
  knowledgeGaps: string; // markdown
  comments: string; // markdown
  parentName: string | null; // parent ticket name
  sprintName: string | null; // sprint this ticket belongs to
}

/** Build a ticket name from type and tree path. e.g. ("feat", [10, 0]) → "feat-ESE-10-0" */
export function ticketNameFromTree(type: string, tree: number[]): string {
  return `${type}-ESE-${tree.join("-")}`;
}

/** Build a ticket filename from type and tree path. e.g. ("feat", [10, 0]) → "feat-ESE-10-0.json" */
export function ticketFilename(type: string, tree: number[]): string {
  return `${ticketNameFromTree(type, tree)}.json`;
}

/** Parse a ticket name back to type and tree. e.g. "feat-ESE-10-0" → { type: "feat", tree: [10, 0] } */
export function parseTicketName(name: string): { type: string; tree: number[] } | null {
  const match = name.match(/^(feat|bugfix|task)-ESE-(.+)$/);
  if (!match) return null;
  const type = match[1]!;
  const treePart = match[2]!;
  const tree = treePart.split("-").map(Number);
  if (tree.some(isNaN)) return null;
  return { type, tree };
}

export interface TicketIdRelationship {
  [name: string]: string; // ticket name → UUID
}

export interface StatusDefinition {
  name: string;
  forwardTransitions: string[];
  exitCriteria: string[]; // exit criteria function names
  featOnly?: boolean; // demo statuses only apply to feat tickets
}

export interface StatusesConfig {
  statuses: StatusDefinition[];
}

export interface Sprint {
  name: string;
  status: "planning" | "active" | "complete";
  ticketNames: string[];
  totalPoints: number;
  completedPoints: number;
  totalTickets: number;
  completedTickets: number;
  hours: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface SprintsData {
  sprints: Sprint[];
}

export interface VelocityEntry {
  sprint: string;
  completedPoints: number;
  totalPoints: number;
  completedTickets: number;
  totalTickets: number;
  hours: number;
}

export interface VelocityData {
  entries: VelocityEntry[];
}

export interface AuditEntry {
  timestamp: string;
  ticket: string;
  from: string;
  to: string;
  team: string;
}

export interface ExitCriteriaResult {
  passed: boolean;
  errors: string[];
}
