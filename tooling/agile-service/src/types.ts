export interface Ticket {
  id: string; // UUID, immutable
  name: string; // e.g. "task-ESE-0006"
  type: "feat" | "bugfix" | "task";
  title: string;
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
