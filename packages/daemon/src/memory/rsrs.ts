import { homedir } from "node:os";
import {
  buildChildProcessEnv,
  killProcessTree,
  spawnCommand,
} from "@cocurdex/agent-adapters";
import {
  isMemoryImportance,
  type MemoryDoctorCheck,
  type MemoryDoctorReport,
  type MemoryEntry,
  type MemoryImportance,
  type MemoryRecallItem,
} from "@cocurdex/shared";
import type { RsrsInvoke } from "./rsrs-invoke";

const VERSION_TIMEOUT_MS = 20_000;
const CONFIG_TIMEOUT_MS = 30_000;
const DOCTOR_TIMEOUT_MS = 180_000;
const RECALL_TIMEOUT_MS = 25_000;
const SHOW_TIMEOUT_MS = 25_000;
const REMEMBER_TIMEOUT_MS = 180_000;
const POLICY_TIMEOUT_MS = 30_000;
const CLOUD_AUTH_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 2_000_000;

const ANSI_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`,
  "g",
);

export interface RsrsRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface RsrsCommandFailure extends Error {
  code?: string;
  stderr?: string;
}

export interface RsrsExecutable {
  command: string;
  env: Readonly<Record<string, string>>;
}

export interface RsrsCloudSummary {
  workspaceMode?: string | null;
  dataDir: string | null;
  server: string | null;
  account: string | null;
  space: string | null;
  hasSession: boolean;
  hasToken: boolean;
  hasKeys: boolean;
  autosync: boolean;
  offline: boolean;
  syncing: boolean;
  pending: number;
  conflicts: number;
  lastSyncAt: string | null;
  syncError: string | null;
}

export interface RsrsDoctorResult {
  report: MemoryDoctorReport;
  installed: boolean;
}

export interface RsrsCommandOptions {
  timeoutMs?: number;
  cwd?: string;
}

function stripAnsi(text: string) {
  return text.replace(ANSI_PATTERN, "");
}

function decodeOutput(buffer: Buffer) {
  return stripAnsi(buffer.toString("utf8")).replace(/^\uFEFF/, "");
}

function commandError(
  message: string,
  code: string,
  stderr?: string,
): RsrsCommandFailure {
  const error = new Error(message) as RsrsCommandFailure;
  error.code = code;
  error.stderr = stderr;
  return error;
}

export async function runRsrs(
  executable: RsrsExecutable,
  args: readonly string[],
  options: RsrsCommandOptions = {},
): Promise<RsrsRunResult> {
  const timeoutMs = options.timeoutMs ?? VERSION_TIMEOUT_MS;
  const extraEnv: NodeJS.ProcessEnv = { ...executable.env };
  for (const name of ["RSRS_LIBC", "RESPIRE_LIBC", "ONEMEMORY_LIBC"]) {
    const value = process.env[name];
    if (value) extraEnv[name] = value;
  }
  const env = buildChildProcessEnv(process.env, { extraEnv });

  return new Promise<RsrsRunResult>((resolve, reject) => {
    let settled = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const child = spawnCommand(executable.command, args, {
      cwd: options.cwd ?? homedir(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const finish = (result: RsrsRunResult | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    };
    const kill = (reason: string) => {
      if (child.pid !== undefined) {
        void killProcessTree(child.pid).catch(() => undefined);
      }
      finish(commandError(reason, "timeout"));
    };
    const timer = setTimeout(
      () => kill(`rsrs ${args[0] ?? "command"} timed out after ${timeoutMs}ms`),
      timeoutMs,
    );
    timer.unref?.();

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        kill("rsrs output exceeded the size limit");
        return;
      }
      stdout.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_OUTPUT_BYTES) return;
      stderr.push(chunk);
    });
    child.once("error", (error) => {
      finish(
        commandError(`Could not start rsrs: ${error.message}`, "spawn_failed"),
      );
    });
    child.once("close", (code, signal) => {
      const out = decodeOutput(Buffer.concat(stdout));
      const err = decodeOutput(Buffer.concat(stderr));
      if (signal) {
        finish(
          commandError(`rsrs was terminated by ${signal}`, "terminated", err),
        );
        return;
      }
      finish({ stdout: out, stderr: err, code });
    });
  });
}

function jsonCandidates(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const candidates: string[] = [trimmed];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  const lines = trimmed.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line?.startsWith("{") && line.endsWith("}")) {
      candidates.push(line);
    }
  }
  return candidates;
}

export function parseRsrsJson(stdout: string): Record<string, unknown> {
  for (const candidate of jsonCandidates(stdout)) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
  }
  throw commandError("rsrs returned output that is not valid JSON", "bad_json");
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function rsrsErrorText(payload: Record<string, unknown>) {
  const errors = Array.isArray(payload.errors)
    ? payload.errors.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];
  if (errors.length > 0) return errors.join("; ");
  const summary = asRecord(payload.summary);
  return stringValue(summary?.reason) ?? null;
}

export function parseVersion(stdout: string) {
  const match = /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(stdout);
  return match?.[1] ?? null;
}

export async function readRsrsVersion(
  executable: RsrsExecutable,
  timeoutMs = VERSION_TIMEOUT_MS,
) {
  const result = await runRsrs(executable, ["--version"], { timeoutMs });
  return parseVersion(`${result.stdout}\n${result.stderr}`);
}

function parseCloudSummary(summary: Record<string, unknown>): RsrsCloudSummary {
  const session = asRecord(summary.session) ?? {};
  const sync = asRecord(summary.sync_live) ?? {};
  const scheduler = asRecord(summary.sync_scheduler) ?? {};
  const user = stringValue(session.user);
  const phase = (stringValue(sync.phase) ?? "").toLowerCase();
  const lastSuccess = numberValue(scheduler.last_success_unix);
  return {
    dataDir: stringValue(summary.data_dir),
    workspaceMode: stringValue(summary.workspace),
    server: stringValue(summary.server_addr) ?? stringValue(session.addr),
    account: user && user !== "local" ? user : null,
    space: null,
    hasSession: session.has_session === true,
    hasToken: session.has_token === true,
    hasKeys: session.has_local_keys === true,
    autosync: summary.autosync === true,
    offline: summary.offline === true,
    syncing: Boolean(phase) && phase !== "ok" && phase !== "idle",
    pending: Math.max(0, Number(sync.pending) || 0),
    conflicts: Math.max(0, Number(sync.conflicts) || 0),
    lastSyncAt:
      lastSuccess && lastSuccess > 0
        ? new Date(lastSuccess * 1000).toISOString()
        : null,
    syncError: stringValue(sync.error),
  };
}

export function parseRsrsCloudStatus(payload: Record<string, unknown>) {
  return parseCloudSummary(asRecord(payload.summary) ?? {});
}

export async function readRsrsStatus(
  executable: RsrsExecutable,
  timeoutMs = CONFIG_TIMEOUT_MS,
): Promise<RsrsCloudSummary> {
  const result = await runRsrs(executable, ["status", "--json"], { timeoutMs });
  const payload = parseRsrsJson(result.stdout);
  const error = rsrsErrorText(payload);
  if (result.code !== 0 || payload.status === "fail")
    throw new Error(error ?? "Memory status is unavailable");
  return parseRsrsCloudStatus(payload);
}

export async function writeRsrsAutosync(
  executable: RsrsExecutable,
  enabled: boolean,
  timeoutMs = CONFIG_TIMEOUT_MS,
) {
  await runRsrs(
    executable,
    ["config", "--autosync", enabled ? "true" : "false", "--json"],
    { timeoutMs },
  );
}

function cloudFailure(
  payload: Record<string, unknown> | null,
  result: RsrsRunResult,
) {
  const message =
    (payload ? rsrsErrorText(payload) : null) ??
    result.stderr.trim() ??
    result.stdout.trim();
  return commandError(
    message || "rsrs cloud command failed",
    "cloud_failed",
    result.stderr,
  );
}

function parseOptionalJson(stdout: string) {
  try {
    return parseRsrsJson(stdout);
  } catch {
    return null;
  }
}

export async function registerRsrsAccount(
  executable: RsrsExecutable,
  input: { user: string; password: string },
  timeoutMs = CLOUD_AUTH_TIMEOUT_MS,
) {
  const result = await runRsrs(
    executable,
    ["register", "--json", "--user", input.user, "--pass", input.password],
    { timeoutMs },
  );
  const payload = parseOptionalJson(result.stdout);
  if (result.code !== 0 || payload?.status === "fail") {
    throw cloudFailure(payload, result);
  }
  const summary = asRecord(payload?.summary) ?? {};
  return {
    recoveryKey: stringValue(summary.super),
    user: stringValue(summary.user) ?? input.user,
  };
}

export async function loginRsrsAccount(
  executable: RsrsExecutable,
  input: {
    user: string;
    password: string;
    recoveryKey: string | null;
  },
  timeoutMs = CLOUD_AUTH_TIMEOUT_MS,
) {
  const args = [
    "login",
    "--json",
    "--interactive",
    "--user",
    input.user,
    "--pass",
    input.password,
  ];
  if (input.recoveryKey) args.push("--super", input.recoveryKey);
  const result = await runRsrs(executable, args, { timeoutMs });
  const payload = parseOptionalJson(result.stdout);
  if (result.code !== 0 || payload?.status === "fail") {
    throw cloudFailure(payload, result);
  }
  const summary = asRecord(payload?.summary) ?? {};
  return {
    recoveryKey:
      stringValue(summary.super_issued) ?? stringValue(summary.super),
    user: stringValue(summary.user) ?? input.user,
  };
}

export async function logoutRsrs(
  executable: RsrsExecutable,
  timeoutMs = CONFIG_TIMEOUT_MS,
) {
  const result = await runRsrs(executable, ["logout", "--json"], { timeoutMs });
  if (result.code !== 0) {
    throw cloudFailure(parseOptionalJson(result.stdout), result);
  }
}

export async function exportRsrsKeys(
  executable: RsrsExecutable,
  timeoutMs = CONFIG_TIMEOUT_MS,
) {
  const result = await runRsrs(executable, ["keys-export", "--json"], {
    timeoutMs,
  });
  const payload = parseOptionalJson(result.stdout);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  for (const item of items) {
    const record = asRecord(item);
    if (record?.name === "content") {
      const value = stringValue(record.value);
      if (value) return value;
    }
  }
  const details = asRecord(payload?.details);
  const inline = details ? stringValue(details.content) : null;
  if (inline) return inline;
  const raw = result.stdout.trim();
  if (raw && (result.code === 0 || result.code === 2)) return raw;
  throw cloudFailure(payload, result);
}

function doctorStatus(value: unknown): MemoryDoctorCheck["status"] {
  return value === "ok" ||
    value === "warn" ||
    value === "fail" ||
    value === "skip"
    ? value
    : "skip";
}

export async function readRsrsDoctor(
  executable: RsrsExecutable,
  options: { remote?: boolean; checkUpdate?: boolean } = {},
): Promise<RsrsDoctorResult> {
  const args = ["doctor", "--json"];
  if (options.remote) args.push("--remote");
  if (options.checkUpdate) args.push("--check-update");
  const result = await runRsrs(executable, args, {
    timeoutMs: DOCTOR_TIMEOUT_MS,
  });
  const payload = parseRsrsJson(result.stdout);
  const summary = asRecord(payload.summary) ?? {};
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const checks: MemoryDoctorCheck[] = rawItems.flatMap((item) => {
    const record = asRecord(item);
    const name = stringValue(record?.name);
    if (!name) return [];
    return [
      {
        name,
        status: doctorStatus(record?.status),
        value: stringValue(record?.value) ?? "",
      },
    ];
  });
  const criticalChecks = new Set([
    "store",
    "data dir",
    "session",
    "embedder",
    "model index",
    "memory status",
    "lock",
  ]);
  const criticalFailed = checks.some(
    (check) => criticalChecks.has(check.name) && check.status === "fail",
  );
  const status = criticalFailed
    ? "fail"
    : (Number(summary.fail) || 0) > 0 || (Number(summary.warn) || 0) > 0
      ? "warn"
      : "ok";
  const installed = !criticalFailed;
  return {
    report: {
      status,
      version: stringValue(summary.version),
      summary: {
        total: Number(summary.total) || checks.length,
        pass: Number(summary.pass) || 0,
        warn: Number(summary.warn) || 0,
        fail: Number(summary.fail) || 0,
        skip: Number(summary.skip) || 0,
      },
      checks,
      checkedAt: new Date().toISOString(),
    },
    installed,
  };
}

export function parseRecallPayload(
  payload: Record<string, unknown>,
): MemoryRecallItem[] {
  const details = Array.isArray(payload.details) ? payload.details : [];
  return details.flatMap((entry) => {
    const record = asRecord(entry);
    const id = stringValue(record?.id);
    const title = stringValue(record?.title);
    if (!id) return [];
    return [
      {
        id,
        title: title ?? id,
        score: numberValue(record?.score),
        importance: isMemoryImportance(record?.importance)
          ? record.importance
          : null,
        updatedAt: stringValue(record?.updatedAt),
      },
    ];
  });
}

export function parseShowPayload(
  payload: Record<string, unknown>,
): MemoryEntry | null {
  const details = asRecord(payload.details);
  return parseEntryRecord(details?.entry);
}

export function parseEntryRecord(value: unknown): MemoryEntry | null {
  const entry = asRecord(value);
  if (!entry) return null;
  const id = stringValue(entry.id);
  if (!id) return null;
  return {
    id,
    title: stringValue(entry.title) ?? id,
    content: stringValue(entry.content) ?? "",
    importance: isMemoryImportance(entry.importance) ? entry.importance : null,
    kind: stringValue(entry.kind),
    project: stringValue(entry.project),
    tags: stringArray(entry.tags),
    parentId: stringValue(entry.parent_id),
    createdAt: stringValue(entry.created_at),
    updatedAt: stringValue(entry.updated_at),
    device: stringValue(entry.device),
  };
}

export function parseRememberPayload(payload: Record<string, unknown>): {
  action: "created" | "candidates" | "merged" | "skipped" | "failed";
  id: string | null;
  title: string | null;
  candidates: MemoryRecallItem[];
  message: string | null;
} {
  const summary = asRecord(payload.summary) ?? {};
  const rawAction = stringValue(summary.action) ?? "";
  const id = stringValue(summary.id);
  const title = stringValue(summary.title);
  const message = rsrsErrorText(payload);
  let candidates = parseRecallPayload(payload);
  const pending =
    summary.state === "candidates" ||
    summary.state === "parent_candidates" ||
    rawAction === "candidates";
  if (pending && candidates.length === 0 && Array.isArray(payload.items)) {
    candidates = payload.items.flatMap((value) => {
      const item = asRecord(value);
      const candidateId = stringValue(item?.name);
      if (!candidateId || !/^[a-f\d]{8}(?:-[a-f\d-]+)?$/i.test(candidateId))
        return [];
      const text = stringValue(item?.value) ?? "";
      const match = /^similarity=(\d+(?:\.\d+)?)% title=(.*)$/s.exec(text);
      return [
        {
          id: candidateId,
          title: match?.[2] ?? candidateId,
          score: match ? Number(match[1]) / 100 : null,
          importance: null,
          updatedAt: null,
        },
      ];
    });
  }
  if (rawAction === "created" && id) {
    return { action: "created", id, title, candidates: [], message };
  }
  if (rawAction === "merged" || rawAction === "merge") {
    return { action: "merged", id, title, candidates: [], message };
  }
  if (payload.status === "fail") {
    return {
      action: "failed",
      id: null,
      title: null,
      candidates: [],
      message: `Nothing was saved. ${message ?? "rsrs reported a failure."}`,
    };
  }
  if (pending || candidates.length > 0) {
    const actions = stringArray(payload.actions).join("\n");
    return {
      action: "candidates",
      id: null,
      title,
      candidates,
      message:
        message ??
        (actions ||
          "Nothing was saved. Read candidates and choose merge or attach before retrying."),
    };
  }
  if (id) {
    return { action: "created", id, title, candidates: [], message };
  }
  return { action: "skipped", id: null, title: null, candidates: [], message };
}

export async function recallMemories(
  invoke: RsrsInvoke,
  input: {
    query: string;
    limit?: number;
    project?: string | null;
    timeoutMs?: number;
  },
) {
  const args = [
    "recall",
    "--json",
    "--titles",
    "--limit",
    String(input.limit ?? 8),
  ];
  if (input.project) {
    args.push("--project", input.project);
  }
  args.push(input.query);
  const { payload } = await invoke(args, input.timeoutMs ?? RECALL_TIMEOUT_MS);
  return {
    items: parseRecallPayload(payload),
    error: rsrsErrorText(payload),
  };
}

export async function showMemory(
  invoke: RsrsInvoke,
  id: string,
  timeoutMs = SHOW_TIMEOUT_MS,
) {
  const { payload } = await invoke(["show", "--json", id], timeoutMs);
  return {
    entry: parseShowPayload(payload),
    error: rsrsErrorText(payload),
  };
}

export interface RememberCommandInput {
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

function appendFlag(args: string[], name: string, value: string | null) {
  if (value) args.push(name, value);
}

export async function rememberMemory(
  invoke: RsrsInvoke,
  input: RememberCommandInput,
  timeoutMs = REMEMBER_TIMEOUT_MS,
) {
  const args = ["remember", "--json"];
  appendFlag(args, "--title", input.title);
  appendFlag(args, "--importance", input.importance ?? null);
  appendFlag(args, "--type", input.type ?? null);
  appendFlag(args, "--project", input.project ?? null);
  appendFlag(args, "--parent", input.parentId ?? null);
  if (input.tags?.length) args.push("--tags", input.tags.join(","));
  if (input.force) args.push("--force");
  if (input.mergeIds?.length)
    args.push("--merge-ids", input.mergeIds.join(","));
  if (input.supersedes?.length) {
    args.push("--supersedes", input.supersedes.join(","));
  }
  if (input.seeAlso?.length) args.push("--see-also", input.seeAlso.join(","));
  args.push(input.content);
  const { payload } = await invoke(args, timeoutMs);
  return parseRememberPayload(payload);
}

export async function readRsrsPolicy(executable: RsrsExecutable) {
  const result = await runRsrs(executable, ["prompt"], {
    timeoutMs: POLICY_TIMEOUT_MS,
  });
  return result.stdout.trim();
}

const RUNTIME_INSTALL_TIMEOUT_MS = 15 * 60_000;
const RUNTIME_CONTROL_TIMEOUT_MS = 120_000;
const MODEL_INSTALL_TIMEOUT_MS = 60 * 60_000;

async function runRsrsStep(
  executable: RsrsExecutable,
  args: readonly string[],
  timeoutMs: number,
) {
  const result = await runRsrs(executable, args, { timeoutMs });
  const payload = parseOptionalJson(result.stdout);
  if (result.code === 0 && payload?.status !== "fail") return payload;
  const reason =
    (payload ? rsrsErrorText(payload) : null) ||
    result.stderr.trim() ||
    result.stdout.trim() ||
    `exit ${result.code ?? "unknown"}`;
  throw commandError(
    `rsrs ${args.slice(0, 2).join(" ")} failed: ${reason}`,
    "setup_failed",
    result.stderr,
  );
}

export function installRsrsRuntime(executable: RsrsExecutable) {
  return runRsrsStep(
    executable,
    ["runtime", "install", "--json"],
    RUNTIME_INSTALL_TIMEOUT_MS,
  );
}

export function startRsrsRuntime(executable: RsrsExecutable) {
  return runRsrsStep(
    executable,
    ["runtime", "start", "--json"],
    RUNTIME_CONTROL_TIMEOUT_MS,
  );
}

export function stopRsrsRuntime(
  executable: RsrsExecutable,
  timeoutMs = RUNTIME_CONTROL_TIMEOUT_MS,
) {
  return runRsrsStep(executable, ["runtime", "stop", "--json"], timeoutMs);
}

export function restartRsrsRuntime(executable: RsrsExecutable) {
  return runRsrsStep(
    executable,
    ["runtime", "restart", "--json"],
    RUNTIME_CONTROL_TIMEOUT_MS,
  );
}

export function createRsrsLocalKeys(executable: RsrsExecutable) {
  return runRsrsStep(
    executable,
    ["keygen", "--json"],
    RUNTIME_CONTROL_TIMEOUT_MS,
  );
}

export function installRsrsModel(executable: RsrsExecutable) {
  return runRsrsStep(
    executable,
    ["model", "install", "--json"],
    MODEL_INSTALL_TIMEOUT_MS,
  );
}

const INJECT_TARGETS_TIMEOUT_MS = 10_000;

// `rsrs inject --targets` reports, per host agent, whether its global
// instruction file carries the rsrs block; 2.x reports `fresh` or `stale`
// for an injected block and `absent` otherwise.
const INJECTED_HOST_STATES = new Set(["fresh", "stale", "partial", "present"]);

export function parseInjectedHosts(payload: Record<string, unknown>) {
  const details = Array.isArray(payload.details) ? payload.details : [];
  return details.flatMap((detail) => {
    const record = asRecord(detail);
    const id = stringValue(record?.id);
    const state = stringValue(record?.state);
    return id && state && INJECTED_HOST_STATES.has(state) ? [id] : [];
  });
}

export async function readInjectedHosts(executable: RsrsExecutable) {
  const result = await runRsrs(executable, ["inject", "--targets", "--json"], {
    timeoutMs: INJECT_TARGETS_TIMEOUT_MS,
  });
  return parseInjectedHosts(parseRsrsJson(result.stdout));
}
