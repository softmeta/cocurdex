import os from "node:os";
import type { ScriptRunRepository } from "@cocurdex/db";
import {
  type CreateScriptRunPayload,
  clampScriptRunMaxAgents,
  isScriptRunTerminal,
  parseScriptRunSettings,
  renderScriptRunReport,
  SCRIPT_RUN_MAX_CONCURRENCY,
  SCRIPT_RUN_MAX_LIST_ITEMS,
  SCRIPT_RUN_NAME_PATTERN,
  SCRIPT_RUN_SETTINGS_KEY,
  type ScriptRunChangedEvent,
  type ScriptRunRecord,
  type ScriptRunSettings,
  type SessionRecord,
  type StartScriptRunPayload,
  validateSessionId,
} from "@cocurdex/shared";
import { createConcurrencyGate } from "./concurrency-gate";
import {
  runScriptAgent,
  type ScriptAgentDeps,
  type ScriptAgentRun,
  type ScriptRunAbortReason,
} from "./script-agent";
import {
  runScript,
  ScriptAbortedError,
  ScriptRejectedError,
  validateScript,
} from "./script-sandbox";

export type ScriptRunErrorCode =
  | "run_not_found"
  | "requester_not_found"
  | "requester_not_main"
  | "invalid_name"
  | "invalid_script"
  | "not_draft";

export class ScriptRunError extends Error {
  override readonly name = "ScriptRunError";

  constructor(
    readonly code: ScriptRunErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}

export interface ScriptRunModuleDeps extends ScriptAgentDeps {
  repository: ScriptRunRepository;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  hasActiveTurn(sessionId: string): boolean;
  stopSession(sessionId: string): Promise<unknown>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  broadcast(event: ScriptRunChangedEvent): void;
  maxConcurrency?: number;
}

interface ActiveRun {
  controller: AbortController;
  activeSessionIds: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
}

function errorMessageOf(error: unknown, reason: ScriptRunAbortReason | null) {
  if (reason?.kind === "failed") return reason.error;
  return error instanceof Error ? error.message : String(error);
}

function abortReasonOf(error: unknown): ScriptRunAbortReason | null {
  if (!(error instanceof ScriptAbortedError)) return null;
  const reason = error.reason as ScriptRunAbortReason | undefined;
  return reason?.kind ? reason : { kind: "cancelled", notifyRequester: true };
}

export class ScriptRunModule {
  private readonly active = new Map<string, ActiveRun>();
  private readonly gate;

  constructor(private readonly deps: ScriptRunModuleDeps) {
    this.gate = createConcurrencyGate(
      deps.maxConcurrency ??
        Math.min(SCRIPT_RUN_MAX_CONCURRENCY, os.availableParallelism()),
    );
  }

  async getSettings(): Promise<ScriptRunSettings> {
    return parseScriptRunSettings(
      await this.deps.getSetting(SCRIPT_RUN_SETTINGS_KEY),
    );
  }

  async saveSettings(settings: ScriptRunSettings) {
    const normalized = parseScriptRunSettings(JSON.stringify(settings));
    await this.deps.setSetting(
      SCRIPT_RUN_SETTINGS_KEY,
      JSON.stringify(normalized),
    );
    return normalized;
  }

  async create(payload: CreateScriptRunPayload) {
    validateSessionId(payload.requesterSessionId);
    const requester = await this.requireRequester(payload.requesterSessionId);
    if (!SCRIPT_RUN_NAME_PATTERN.test(payload.name)) {
      throw new ScriptRunError("invalid_name");
    }
    try {
      validateScript(payload.script);
    } catch (error) {
      if (error instanceof ScriptRejectedError) {
        throw new ScriptRunError("invalid_script", error.message);
      }
      throw error;
    }
    const settings = await this.getSettings();
    const run: ScriptRunRecord = {
      id: this.deps.createId(),
      workspaceId: requester.workspaceId,
      requesterSessionId: requester.id,
      name: payload.name,
      script: payload.script,
      status: "draft",
      maxAgents: settings.defaultMaxAgents,
      agentCount: 0,
      resultJson: null,
      error: null,
      createdAt: this.deps.now(),
      startedAt: null,
      completedAt: null,
    };
    await this.save(run);
    return run;
  }

  async get(runId: string) {
    const snapshot = await this.deps.repository.getRun(runId);
    if (!snapshot) throw new ScriptRunError("run_not_found");
    return snapshot;
  }

  list(filter: { workspaceId?: string; requesterSessionId?: string }) {
    return this.deps.repository.listRuns(filter);
  }

  async start(payload: StartScriptRunPayload) {
    const { run: draft } = await this.get(payload.runId);
    if (draft.status !== "draft") throw new ScriptRunError("not_draft");
    const requester = await this.requireRequester(draft.requesterSessionId);
    const settings = await this.getSettings();
    const run: ScriptRunRecord = {
      ...draft,
      status: "running",
      maxAgents: clampScriptRunMaxAgents(payload.maxAgents, draft.maxAgents),
      startedAt: this.deps.now(),
    };
    await this.save(run);

    const controller = new AbortController();
    const active: ActiveRun = {
      controller,
      activeSessionIds: new Set(),
      timer: null,
    };
    if (settings.maxDurationMinutes) {
      const minutes = settings.maxDurationMinutes;
      active.timer = setTimeout(() => {
        controller.abort({
          kind: "failed",
          error: `Script run exceeded ${minutes} minutes.`,
        } satisfies ScriptRunAbortReason);
      }, minutes * 60_000);
    }
    this.active.set(run.id, active);
    void this.execute(run, requester, settings, active);
    return run;
  }

  async cancel(runId: string) {
    const { run } = await this.get(runId);
    if (run.status === "draft") {
      const discarded: ScriptRunRecord = {
        ...run,
        status: "cancelled",
        completedAt: this.deps.now(),
      };
      await this.save(discarded);
      return discarded;
    }
    this.abort(runId, { kind: "cancelled", notifyRequester: true });
    return run;
  }

  async cancelForRequester(requesterSessionId: string) {
    const runs = await this.deps.repository.listRuns({ requesterSessionId });
    for (const run of runs) {
      if (run.status === "running") {
        this.abort(run.id, { kind: "cancelled", notifyRequester: false });
      }
    }
  }

  async shutdown() {
    for (const runId of this.active.keys()) {
      this.abort(runId, { kind: "shutdown" });
    }
    await this.deps.repository.interruptRunning(this.deps.now());
  }

  async recoverInterrupted() {
    const runs = await this.deps.repository.interruptRunning(this.deps.now());
    for (const run of runs) this.changed(run);
  }

  private abort(runId: string, reason: ScriptRunAbortReason) {
    this.active.get(runId)?.controller.abort(reason);
  }

  private async execute(
    run: ScriptRunRecord,
    requester: SessionRecord,
    settings: ScriptRunSettings,
    active: ActiveRun,
  ) {
    const context: ScriptAgentRun = {
      run,
      requester,
      schemaMaxAttempts: settings.schemaMaxAttempts,
      gate: this.gate,
      signal: active.controller.signal,
      activeSessionIds: active.activeSessionIds,
      abort: (reason) => active.controller.abort(reason),
      onChanged: async () => {
        if (this.active.has(run.id)) await this.save(run);
        else this.changed(run);
      },
    };
    let finished: ScriptRunRecord;
    let notifyRequester = true;
    try {
      const result = await runScript(
        run.script,
        {
          agent: (prompt, options) =>
            runScriptAgent(this.deps, context, prompt, options),
          log: () => {},
        },
        {
          signal: active.controller.signal,
          maxListItems: SCRIPT_RUN_MAX_LIST_ITEMS,
        },
      );
      finished = {
        ...run,
        status: "completed",
        resultJson: JSON.stringify(result ?? null),
      };
    } catch (error) {
      const reason = abortReasonOf(error);
      if (reason?.kind === "shutdown") {
        if (active.timer) clearTimeout(active.timer);
        this.active.delete(run.id);
        return;
      }
      if (reason?.kind === "cancelled") {
        notifyRequester = reason.notifyRequester;
        finished = { ...run, status: "cancelled" };
      } else {
        finished = {
          ...run,
          status: "failed",
          error: errorMessageOf(error, reason),
        };
      }
    }
    if (active.timer) clearTimeout(active.timer);
    this.active.delete(run.id);
    for (const sessionId of active.activeSessionIds) {
      await this.deps.stopSession(sessionId).catch(() => {});
    }
    const completed = { ...finished, completedAt: this.deps.now() };
    await this.save(completed);
    if (notifyRequester) await this.report(completed);
  }

  private async report(run: ScriptRunRecord) {
    const requester = await this.deps.getSession(run.requesterSessionId);
    if (!requester || requester.archivedAt || !isScriptRunTerminal(run.status))
      return;
    await this.deps
      .sendSessionMessage({
        sessionId: requester.id,
        content: renderScriptRunReport(run),
        delivery: this.deps.hasActiveTurn(requester.id)
          ? "queue-after-run"
          : "start-new-run",
        origin: { kind: "scriptRun", runId: run.id, runName: run.name },
      })
      .catch(() => {});
  }

  private async requireRequester(sessionId: string) {
    const requester = await this.deps.getSession(sessionId);
    if (!requester || requester.archivedAt) {
      throw new ScriptRunError("requester_not_found");
    }
    if ((requester.sessionKind ?? "main") !== "main") {
      throw new ScriptRunError("requester_not_main");
    }
    return requester;
  }

  private async save(run: ScriptRunRecord) {
    await this.deps.repository.saveRun(run);
    this.changed(run);
  }

  private changed(run: ScriptRunRecord) {
    this.deps.broadcast({
      type: "scriptRun.changed",
      runId: run.id,
      requesterSessionId: run.requesterSessionId,
    });
  }
}
