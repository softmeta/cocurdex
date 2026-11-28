import { type MemoryPlatform, rsrsCliAsset } from "./memory-rsrs-release";

export const MEMORY_SETTINGS_KEY = "memory";
export const MEMORY_POLICY_TOOL_NAME = "memory_policy";
export const MEMORY_TOOL_GROUP = "memory" as const;

export const RSRS_SITE_URL = "https://rsrs.rs";
export const RSRS_REPO_URL = "https://github.com/risense-ai/respire-cli";
export const RSRS_DASHBOARD_URL = "https://dash.rsrs.rs";

export const MEMORY_INSTALL_HINT =
  "Set up memory from Settings > Memory, or run: cocurdex memory install.";
export const MEMORY_ENABLE_HINT =
  "Turn memory on in Settings > Memory, or run: cocurdex memory on.";
export const MEMORY_IDENTITY_HINT =
  "For local-only memory, run: cocurdex memory install. Multi-device sync is managed by rsrs itself: sign in with rsrs login, then manage sync with rsrs web or the rsrs app.";

export const MEMORY_SYNC_MANAGED_BY_RSRS =
  "Multi-device sync is managed by rsrs itself. Sign in with: rsrs login. Manage sync with: rsrs web, or the rsrs app.";

export const MEMORY_MISSING_EXECUTABLE_MESSAGE = `rsrs is not installed. ${MEMORY_INSTALL_HINT}`;
export const MEMORY_DISABLED_MESSAGE = `Memory is off. ${MEMORY_ENABLE_HINT}`;

const MISSING_IDENTITY_PATTERN =
  /no local session|no session|not (?:logged|signed) in/i;

export function isMissingMemoryIdentity(message: string | null) {
  return MISSING_IDENTITY_PATTERN.test(message ?? "");
}

export function withMemoryIdentityHint(message: string | null) {
  const text = message?.trim() ?? "";
  return text ? `${text} ${MEMORY_IDENTITY_HINT}` : MEMORY_IDENTITY_HINT;
}

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

export const MEMORY_PROVIDER_IDS = ["rsrs", "ai-memory"] as const;

/** An external library kept in step with the built-in store. */
export type MemoryProviderId = (typeof MEMORY_PROVIDER_IDS)[number];

export function isMemoryProviderId(value: unknown): value is MemoryProviderId {
  return MEMORY_PROVIDER_IDS.includes(value as MemoryProviderId);
}

export const AI_MEMORY_DEFAULT_SERVER_URL = "http://127.0.0.1:49374";
export const AI_MEMORY_REPO_URL = "https://github.com/akitaonrails/ai-memory";

export interface MemoryProviderSettings {
  rsrs: { cliPath: string | null; userLibrary: boolean };
  aiMemory: { serverUrl: string | null };
}

export interface MemorySettings {
  enabled: boolean;
  /** The one external library the built-in store is kept in step with. */
  provider: MemoryProviderId | null;
  providers: MemoryProviderSettings;
  agent: MemoryAgentSettings;
  chat: MemoryChatSettings;
  // `rsrs`, `userLibrary`, and `cliPath` mirror `provider` and
  // `providers.rsrs` for clients and scripts written before providers.
  rsrs: boolean;
  userLibrary: boolean;
  cliPath: string | null;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: true,
  provider: null,
  providers: {
    rsrs: { cliPath: null, userLibrary: true },
    aiMemory: { serverUrl: null },
  },
  rsrs: false,
  agent: {
    injectContext: true,
    tools: true,
  },
  chat: {
    recall: true,
    saveTurns: true,
    saveOnEnd: true,
  },
  userLibrary: true,
  cliPath: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeServerUrl(value: unknown) {
  const text = optionalText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

// A client that predates providers changes only the mirrored fields, so
// where they disagree with the provider fields they carry the newer choice.
function normalizeProvider(
  input: Record<string, unknown>,
): MemoryProviderId | null {
  const chosen = isMemoryProviderId(input.provider)
    ? input.provider
    : input.provider === null
      ? null
      : undefined;
  const legacy = typeof input.rsrs === "boolean" ? input.rsrs : undefined;
  if (chosen === undefined) return legacy ? "rsrs" : null;
  if (legacy === undefined || legacy === (chosen === "rsrs")) return chosen;
  return legacy ? "rsrs" : null;
}

function normalizeRsrsProvider(input: Record<string, unknown>) {
  const providers = isRecord(input.providers) ? input.providers : {};
  const nested = isRecord(providers.rsrs) ? providers.rsrs : {};
  const nestedCli = "cliPath" in nested ? optionalText(nested.cliPath) : null;
  const legacyCli =
    "cliPath" in input ? optionalText(input.cliPath) : nestedCli;
  const nestedLibrary = optionalBoolean(
    nested.userLibrary,
    DEFAULT_MEMORY_SETTINGS.providers.rsrs.userLibrary,
  );
  const legacyLibrary = optionalBoolean(input.userLibrary, nestedLibrary);
  return { cliPath: legacyCli, userLibrary: legacyLibrary };
}

export function normalizeMemorySettings(input: unknown): MemorySettings {
  if (!isRecord(input)) {
    return { ...DEFAULT_MEMORY_SETTINGS };
  }
  const agent = isRecord(input.agent) ? input.agent : {};
  const chat = isRecord(input.chat) ? input.chat : {};
  const providers = isRecord(input.providers) ? input.providers : {};
  const aiMemory = isRecord(providers.aiMemory) ? providers.aiMemory : {};
  const provider = normalizeProvider(input);
  const rsrs = normalizeRsrsProvider(input);
  return {
    enabled: optionalBoolean(input.enabled, DEFAULT_MEMORY_SETTINGS.enabled),
    provider,
    providers: {
      rsrs,
      aiMemory: { serverUrl: normalizeServerUrl(aiMemory.serverUrl) },
    },
    rsrs: provider === "rsrs",
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
    userLibrary: rsrs.userLibrary,
    cliPath: rsrs.cliPath,
  };
}

/** Chooses the external library, keeping the mirrored fields in step. */
export function withMemoryProvider(
  settings: MemorySettings,
  provider: MemoryProviderId | null,
): MemorySettings {
  return { ...settings, provider, rsrs: provider === "rsrs" };
}

export function withMemoryProviderSettings(
  settings: MemorySettings,
  patch: {
    rsrs?: Partial<MemoryProviderSettings["rsrs"]>;
    aiMemory?: Partial<MemoryProviderSettings["aiMemory"]>;
  },
): MemorySettings {
  const rsrs = { ...settings.providers.rsrs, ...patch.rsrs };
  return {
    ...settings,
    providers: {
      rsrs,
      aiMemory: { ...settings.providers.aiMemory, ...patch.aiMemory },
    },
    cliPath: rsrs.cliPath,
    userLibrary: rsrs.userLibrary,
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
  // rsrs's suggested fix for a failing check, when it gives one.
  action?: string | null;
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

export function memoryPlatformSupportsRsrs(platform: MemoryPlatform) {
  return rsrsCliAsset(platform) !== null;
}

export function gateMemorySettings(
  settings: MemorySettings,
  platform: MemoryPlatform,
): MemorySettings {
  if (memoryPlatformSupportsRsrs(platform) || settings.provider !== "rsrs") {
    return settings;
  }
  return withMemoryProvider(settings, null);
}

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

export const MEMORY_USER_LIBRARY_PREFIX = "user:";

export function isUserLibraryMemoryId(id: string) {
  return id.startsWith(MEMORY_USER_LIBRARY_PREFIX);
}

// The user's own rsrs store (~/.rsrs), read-only for Cocurdex.
export interface MemoryUserLibraryStatus {
  detected: boolean;
  reachable: boolean;
}

/** What one sync changed on each side of the built-in store and the external library. */
export interface MemoryLibrarySyncSummary {
  builtin: { added: number; updated: number };
  external: { added: number; updated: number; removed: number };
  /** Changes the external library refused; the next sync retries them. */
  failed: number;
}

export interface MemoryProviderStatus {
  id: MemoryProviderId;
  /** The library answers and can be synced with. */
  available: boolean;
  /** Cocurdex is installing or starting the library. */
  preparing: boolean;
  version: string | null;
  /** Where the library lives: a data folder or a server address. */
  location: string | null;
  error: string | null;
  lastSyncAt: string | null;
}

export interface MemoryStatus {
  settings: MemorySettings;
  /** The chosen external library, or null when memory stays built-in only. */
  provider: MemoryProviderStatus | null;
  // The fields below from `supported` to `upgradeRequired` describe the optional
  // rsrs library; memory itself lives in the daemon and needs none of them.
  /** rsrs is turned on and its executable is present. */
  rsrsAvailable: boolean;
  enabled: boolean;
  supported: boolean;
  available: boolean;
  installation: MemoryInstallationState;
  version: string | null;
  runtimeVersion: string | null;
  executable: string | null;
  dataDir: string | null;
  account: string | null;
  space: string | null;
  cloud: MemoryCloudStatus;
  userLibrary: MemoryUserLibraryStatus;
  doctor: MemoryDoctorReport | null;
  error: string | null;
  // The pinned install stopped on a state only the user or a newer rsrs can
  // clear, while the running store still serves recall and remember.
  installBlocked?: boolean;
  upgradeRequired?: { installed: string; minimum: string } | null;
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
  error: string | null;
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

export type MemoryPartition =
  | { kind: "me" }
  | { kind: "agent"; agentId: string };

const MEMORY_PARTITION_PREFIX = "cocurdex/";
const ME_PARTITION_PROJECT = `${MEMORY_PARTITION_PREFIX}me`;
const AGENT_PARTITION_PREFIX = `${MEMORY_PARTITION_PREFIX}agent/`;

export function memoryPartitionProject(partition: MemoryPartition) {
  return partition.kind === "me"
    ? ME_PARTITION_PROJECT
    : `${AGENT_PARTITION_PREFIX}${partition.agentId}`;
}

export function memoryPartitionOf(
  project: string | null,
): MemoryPartition | null {
  if (project === ME_PARTITION_PROJECT) return { kind: "me" };
  if (project?.startsWith(AGENT_PARTITION_PREFIX)) {
    const agentId = project.slice(AGENT_PARTITION_PREFIX.length);
    return agentId ? { kind: "agent", agentId } : null;
  }
  return null;
}

export interface MemoryProviderCapabilities {
  partitions: boolean;
  list: boolean;
  update: boolean;
  forget: boolean;
  restore: boolean;
  history: boolean;
  revision: boolean;
  export: boolean;
  import: boolean;
}

export interface MemoryListInput {
  limit?: number;
  since?: string | null;
  partition?: MemoryPartition | null;
}

export interface MemoryListResult {
  items: MemoryEntry[];
  error: string | null;
}

export interface MemoryUpdateInput {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
  importance?: MemoryImportance;
}

export type MemoryHistoryAction =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "purge";

export interface MemoryHistoryEntry {
  entryId: string;
  action: MemoryHistoryAction | string;
  title: string | null;
  excerpt: string | null;
  actor: string | null;
  at: string | null;
}

export interface MemoryImportResult {
  imported: number;
  duplicates: number;
  skipped: number;
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
  action: "created" | "candidates" | "merged" | "skipped" | "failed";
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
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];

function redactPrivateKeys(text: string) {
  const chunks: string[] = [];
  let cursor = 0;
  let opening: { index: number; end: number } | undefined;
  for (const marker of text.matchAll(
    /-----(BEGIN|END) [A-Z ]*PRIVATE KEY(?=-----)/g,
  )) {
    if (marker.index < cursor) continue;
    const end = marker.index + marker[0].length + 5;
    if (marker[1] === "BEGIN") {
      opening ??= { index: marker.index, end };
    } else if (opening && marker.index >= opening.end) {
      chunks.push(text.slice(cursor, opening.index), "[redacted]");
      cursor = end;
      opening = undefined;
    }
  }
  return chunks.length === 0 ? text : chunks.join("") + text.slice(cursor);
}

export function redactMemorySecrets(text: string) {
  let result = redactPrivateKeys(text);
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
