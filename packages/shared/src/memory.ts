export const MEMORY_SETTINGS_KEY = "memory";
export const MEMORY_POLICY_TOOL_NAME = "memory_policy";
export const MEMORY_TOOL_GROUP = "memory" as const;

export const RSRS_CLI_PACKAGE = "@rsrsai/cli";
export const RSRS_CLI_VERSION = "1.0.18";
export const RSRS_SITE_URL = "https://rsrs.rs";
export const RSRS_REPO_URL = "https://github.com/risense-ai/respire-cli";
export const RSRS_DASHBOARD_URL = "https://dash.rsrs.rs";

export type MemoryImportance = "important" | "trivial";

export interface MemoryAgentSettings {
  injectContext: boolean;
  tools: boolean;
}

export interface MemoryChatSettings {
  recall: boolean;
  saveTurns: boolean;
  saveOnEnd: boolean;
}

export interface MemorySettings {
  enabled: boolean;
  agent: MemoryAgentSettings;
  chat: MemoryChatSettings;
  cliPath: string | null;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: true,
  agent: {
    injectContext: true,
    tools: true,
  },
  chat: {
    recall: true,
    saveTurns: true,
    saveOnEnd: true,
  },
  cliPath: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeMemorySettings(input: unknown): MemorySettings {
  if (!isRecord(input)) {
    return { ...DEFAULT_MEMORY_SETTINGS };
  }
  const agent = isRecord(input.agent) ? input.agent : {};
  const chat = isRecord(input.chat) ? input.chat : {};
  const cliPath =
    typeof input.cliPath === "string" && input.cliPath.trim()
      ? input.cliPath.trim()
      : null;
  return {
    enabled: optionalBoolean(input.enabled, DEFAULT_MEMORY_SETTINGS.enabled),
    agent: {
      injectContext: optionalBoolean(
        agent.injectContext,
        DEFAULT_MEMORY_SETTINGS.agent.injectContext,
      ),
      tools: optionalBoolean(agent.tools, DEFAULT_MEMORY_SETTINGS.agent.tools),
    },
    chat: {
      recall: optionalBoolean(chat.recall, DEFAULT_MEMORY_SETTINGS.chat.recall),
      saveTurns: optionalBoolean(
        chat.saveTurns,
        DEFAULT_MEMORY_SETTINGS.chat.saveTurns,
      ),
      saveOnEnd: optionalBoolean(
        chat.saveOnEnd,
        DEFAULT_MEMORY_SETTINGS.chat.saveOnEnd,
      ),
    },
    cliPath,
  };
}

export function parseMemorySettings(raw: string | null): MemorySettings {
  if (!raw) {
    return { ...DEFAULT_MEMORY_SETTINGS };
  }
  try {
    return normalizeMemorySettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_MEMORY_SETTINGS };
  }
}

export function serializeMemorySettings(settings: MemorySettings) {
  return JSON.stringify(normalizeMemorySettings(settings));
}

export function isMemoryImportance(value: unknown): value is MemoryImportance {
  return value === "important" || value === "trivial";
}

export interface MemoryDoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail" | "skip";
  value: string;
}

export interface MemoryDoctorReport {
  status: "ok" | "warn" | "fail";
  version: string | null;
  summary: {
    total: number;
    pass: number;
    warn: number;
    fail: number;
    skip: number;
  };
  checks: MemoryDoctorCheck[];
  checkedAt: string;
}

export type MemoryInstallationState =
  | "ready"
  | "missing"
  | "installing"
  | "failed";

export type MemoryRecallOutcome = "recalled" | "empty" | "failed";

export interface MemoryRecallStatus {
  sessionId: string;
  mode: "agent" | "chat";
  outcome: MemoryRecallOutcome;
  error: string | null;
  at: string;
}

export interface MemoryPlatform {
  os: string;
  arch: string;
}

export function memoryPlatformSupportsRsrs(platform: MemoryPlatform) {
  return !(platform.os === "darwin" && platform.arch === "x64");
}

export function gateMemorySettings(
  settings: MemorySettings,
  platform: MemoryPlatform,
): MemorySettings {
  if (memoryPlatformSupportsRsrs(platform) || !settings.enabled)
    return settings;
  return { ...settings, enabled: false };
}

export type MemoryCloudMode = "register" | "signin";

export interface MemoryCloudStatus {
  connected: boolean;
  user: string | null;
  server: string | null;
  autosync: boolean;
  hasKeys: boolean;
  offline: boolean;
  syncing: boolean;
  pending: number;
  conflicts: number;
  lastSyncAt: string | null;
  error: string | null;
}

export const DEFAULT_MEMORY_CLOUD_STATUS: MemoryCloudStatus = {
  connected: false,
  user: null,
  server: null,
  autosync: false,
  hasKeys: false,
  offline: false,
  syncing: false,
  pending: 0,
  conflicts: 0,
  lastSyncAt: null,
  error: null,
};

export interface MemoryCloudConnectInput {
  mode: MemoryCloudMode;
  user: string;
  password: string;
  recoveryKey?: string | null;
}

export interface MemoryCloudConnectResult {
  status: MemoryStatus;
  recoveryKey: string | null;
}

export interface MemoryCloudKeys {
  content: string;
}

export interface MemoryStatus {
  settings: MemorySettings;
  enabled: boolean;
  supported: boolean;
  available: boolean;
  installation: MemoryInstallationState;
  version: string | null;
  executable: string | null;
  dataDir: string | null;
  account: string | null;
  space: string | null;
  cloud: MemoryCloudStatus;
  doctor: MemoryDoctorReport | null;
  error: string | null;
  checkedAt: string | null;
  lastRecall: MemoryRecallStatus | null;
}

export interface MemoryRecallItem {
  id: string;
  title: string;
  score: number | null;
  importance: MemoryImportance | null;
  updatedAt: string | null;
}

export interface MemoryRecallResult {
  query: string;
  items: MemoryRecallItem[];
  truncated: boolean;
}

export interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  importance: MemoryImportance | null;
  kind: string | null;
  project: string | null;
  tags: string[];
  parentId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  device: string | null;
}

export interface MemoryRememberInput {
  content: string;
  title: string;
  importance?: MemoryImportance;
  tags?: string[];
  project?: string | null;
  parentId?: string | null;
  type?: string | null;
  force?: boolean;
  mergeIds?: string[];
  supersedes?: string[];
  seeAlso?: string[];
}

export interface MemoryRememberResult {
  action: "created" | "candidates" | "merged" | "skipped";
  id: string | null;
  title: string | null;
  candidates: MemoryRecallItem[];
  message: string | null;
}

export interface MemorySessionSaveInput {
  sessionId: string;
  force?: boolean;
  importance?: MemoryImportance;
}

export interface MemorySessionSaveResult {
  saved: boolean;
  memoryId: string | null;
  reason: string | null;
}

export interface MemoryInstallResult {
  status: MemoryStatus;
  installed: boolean;
  message: string | null;
}

const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];

export function redactMemorySecrets(text: string) {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[redacted]");
  }
  return result;
}

export function buildMemoryRecallQuery(input: {
  project: string | null;
  message: string;
  title?: string | null;
}) {
  const parts = [input.project, input.title, input.message]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.join(" ").slice(0, 4_000);
}
