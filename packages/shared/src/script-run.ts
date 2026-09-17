export type ScriptRunStatus =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface ScriptRunRecord {
  id: string;
  workspaceId: string;
  requesterSessionId: string;
  name: string;
  script: string;
  status: ScriptRunStatus;
  maxAgents: number;
  agentCount: number;
  resultJson: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export type ScriptRunAgentStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface ScriptRunAgentRecord {
  id: string;
  runId: string;
  sessionId: string;
  label: string;
  status: ScriptRunAgentStatus;
  resultJson: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ScriptRunSnapshot {
  run: ScriptRunRecord;
  agents: ScriptRunAgentRecord[];
}

export interface ScriptAgentOptions {
  label?: string;
  agentRoleId?: string;
  schema?: Record<string, unknown>;
  worktree?: boolean;
}

export interface CreateScriptRunPayload {
  requesterSessionId: string;
  name: string;
  script: string;
}

export interface StartScriptRunPayload {
  runId: string;
  maxAgents?: number;
}

export interface ScriptRunChangedEvent {
  type: "scriptRun.changed";
  runId: string;
  requesterSessionId: string;
}

export interface ScriptRunSettings {
  defaultMaxAgents: number;
  schemaMaxAttempts: number;
  maxDurationMinutes: number | null;
}

export const SCRIPT_RUN_SETTINGS_KEY = "scriptRunSettings";
export const SCRIPT_RUN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const SCRIPT_RUN_MAX_CONCURRENCY = 16;
export const SCRIPT_RUN_HARD_MAX_AGENTS = 1000;
export const SCRIPT_RUN_MAX_LIST_ITEMS = 4096;
export const SCRIPT_RUN_MAX_SCHEMA_ATTEMPTS = 10;

export const DEFAULT_SCRIPT_RUN_SETTINGS: ScriptRunSettings = {
  defaultMaxAgents: 5,
  schemaMaxAttempts: 3,
  maxDurationMinutes: null,
};

const TERMINAL_STATUSES: ReadonlySet<ScriptRunStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

export function isScriptRunTerminal(status: ScriptRunStatus) {
  return TERMINAL_STATUSES.has(status);
}

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function clampScriptRunMaxAgents(value: unknown, fallback: number) {
  return clampInteger(value, 1, SCRIPT_RUN_HARD_MAX_AGENTS, fallback);
}

export function parseScriptRunSettings(raw: string | null): ScriptRunSettings {
  let parsed: Record<string, unknown> = {};
  try {
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (value && typeof value === "object") {
      parsed = value as Record<string, unknown>;
    }
  } catch {
    return DEFAULT_SCRIPT_RUN_SETTINGS;
  }
  const duration = parsed.maxDurationMinutes;
  return {
    defaultMaxAgents: clampScriptRunMaxAgents(
      parsed.defaultMaxAgents,
      DEFAULT_SCRIPT_RUN_SETTINGS.defaultMaxAgents,
    ),
    schemaMaxAttempts: clampInteger(
      parsed.schemaMaxAttempts,
      1,
      SCRIPT_RUN_MAX_SCHEMA_ATTEMPTS,
      DEFAULT_SCRIPT_RUN_SETTINGS.schemaMaxAttempts,
    ),
    maxDurationMinutes:
      typeof duration === "number" && Number.isInteger(duration) && duration > 0
        ? duration
        : null,
  };
}

const JSON_FENCE_OPEN = "```json";
const JSON_FENCE_CLOSE = "\n```";
const WHITESPACE_CHAR = /\s/;

function fencedJsonBodies(text: string) {
  const bodies: string[] = [];
  const lastClose = text.lastIndexOf(JSON_FENCE_CLOSE);
  let from = 0;
  while (from < text.length && from <= lastClose) {
    const start = text.indexOf(JSON_FENCE_OPEN, from);
    if (start === -1) break;
    let bodyStart = -1;
    let cursor = start + JSON_FENCE_OPEN.length;
    while (cursor < lastClose && WHITESPACE_CHAR.test(text.charAt(cursor))) {
      if (text.charAt(cursor) === "\n") bodyStart = cursor + 1;
      cursor++;
    }
    if (bodyStart === -1) {
      from = start + JSON_FENCE_OPEN.length;
      continue;
    }
    const close = text.indexOf(JSON_FENCE_CLOSE, bodyStart);
    bodies.push(text.slice(bodyStart, close));
    from = close + JSON_FENCE_CLOSE.length;
  }
  return bodies;
}

export function extractJsonReply(
  text: string,
): { ok: true; value: unknown } | { ok: false } {
  const candidates = [text.trim(), ...fencedJsonBodies(text).reverse()];
  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {}
  }
  return { ok: false };
}

export function renderScriptRunReport(run: ScriptRunRecord) {
  const header = `[Script run "${run.name}" ${run.status} with ${run.agentCount} agents]`;
  const body = run.resultJson ?? run.error;
  return body ? `${header}\n${body}` : header;
}
