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
import {
  Context,
  Deferred,
  Effect,
  Exit,
  FiberMap,
  FiberSet,
  Layer,
  ManagedRuntime,
  Semaphore,
} from "effect";
import {
  runScriptAgent,
  type ScriptAgentDeps,
  type ScriptAgentRun,
  ScriptAgentSlots,
  type ScriptRunAbortReason,
} from "./script-agent";
import {
  runScript,
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
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  broadcast(event: ScriptRunChangedEvent): void;
  maxConcurrency?: number;
}

type ScriptRunOutcome =
  | { kind: "completed"; result: unknown }
  | ScriptRunAbortReason;

type AbortRequest = Deferred.Deferred<ScriptRunOutcome>;

class ScriptRunFibers extends Context.Service<
  ScriptRunFibers,
  FiberMap.FiberMap<string>
>()("cocurdex/ScriptRunFibers") {}

function scriptRunLayer(maxConcurrency: number) {
  return Layer.mergeAll(
    Layer.effect(ScriptRunFibers, FiberMap.make<string>()),
    Layer.effect(ScriptAgentSlots, Semaphore.make(maxConcurrency)),
  );
}

function withMaxDuration(minutes: number | null | undefined) {
  return <R>(
    self: Effect.Effect<ScriptRunOutcome, never, R>,
  ): Effect.Effect<ScriptRunOutcome, never, R> => {
    if (!minutes) return self;
    return Effect.timeoutOrElse(self, {
      duration: minutes * 60_000,
      orElse: () =>
        Effect.succeed<ScriptRunOutcome>({
          kind: "failed",
          error: `Script run exceeded ${minutes} minutes.`,
        }),
    });
  };
}

function finishedRun(
  run: ScriptRunRecord,
  outcome: ScriptRunOutcome,
): ScriptRunRecord {
  if (outcome.kind === "completed") {
    return {
      ...run,
      status: "completed",
      resultJson: JSON.stringify(outcome.result ?? null),
    };
  }
  if (outcome.kind === "cancelled") return { ...run, status: "cancelled" };
  return { ...run, status: "failed", error: outcome.error };
}

export class ScriptRunModule {
  private readonly aborts = new Map<string, AbortRequest>();
  private readonly runtime;

  constructor(private readonly deps: ScriptRunModuleDeps) {
    this.runtime = ManagedRuntime.make(
      scriptRunLayer(
        deps.maxConcurrency ??
          Math.min(SCRIPT_RUN_MAX_CONCURRENCY, os.availableParallelism()),
      ),
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

    const abort = Deferred.makeUnsafe<ScriptRunOutcome>();
    this.aborts.set(run.id, abort);
    const execute = this.execute(run, requester, settings, abort);
    this.runtime.runFork(
      Effect.gen(function* () {
        const fibers = yield* ScriptRunFibers;
        yield* FiberMap.run(fibers, run.id, execute);
      }),
    );
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
    await this.runtime.dispose();
    await this.deps.repository.interruptRunning(this.deps.now());
  }

  async recoverInterrupted() {
    const runs = await this.deps.repository.interruptRunning(this.deps.now());
    for (const run of runs) this.changed(run);
  }

  private abort(runId: string, reason: ScriptRunAbortReason) {
    const abort = this.aborts.get(runId);
    if (abort) Deferred.doneUnsafe(abort, Exit.succeed(reason));
  }

  private execute(
    run: ScriptRunRecord,
    requester: SessionRecord,
    settings: ScriptRunSettings,
    abort: AbortRequest,
  ) {
    const deps = this.deps;
    const context: ScriptAgentRun = {
      run,
      requester,
      schemaMaxAttempts: settings.schemaMaxAttempts,
      abort: (reason) => Deferred.doneUnsafe(abort, Exit.succeed(reason)),
      onChanged: async () => {
        if (this.aborts.has(run.id)) await this.save(run);
        else this.changed(run);
      },
    };
    const script = Effect.gen(function* () {
      const runAgent = yield* FiberSet.makeRuntimePromise<ScriptAgentSlots>();
      const result = yield* runScript(
        run.script,
        {
          agent: (prompt, options) =>
            runAgent(runScriptAgent(deps, context, prompt, options)),
          log: () => {},
        },
        { maxListItems: SCRIPT_RUN_MAX_LIST_ITEMS },
      );
      return { kind: "completed", result } satisfies ScriptRunOutcome;
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed<ScriptRunOutcome>({
          kind: "failed",
          error: error.message,
        }),
      ),
      Effect.scoped,
    );
    const finish = (outcome: ScriptRunOutcome) =>
      Effect.promise(async () => {
        this.aborts.delete(run.id);
        const completed = {
          ...finishedRun(run, outcome),
          completedAt: deps.now(),
        };
        await this.save(completed);
        if (outcome.kind !== "cancelled" || outcome.notifyRequester) {
          await this.report(completed);
        }
      });
    return Effect.raceFirst(script, Deferred.await(abort)).pipe(
      withMaxDuration(settings.maxDurationMinutes),
      Effect.flatMap(finish),
      Effect.ensuring(Effect.sync(() => this.aborts.delete(run.id))),
    );
  }

  private async report(run: ScriptRunRecord) {
    const requester = await this.deps.getSession(run.requesterSessionId);
    if (!requester || requester.archivedAt || !isScriptRunTerminal(run.status))
      return;
    await this.deps
      .sendSessionMessage({
        sessionId: requester.id,
        messageId: crypto.randomUUID(),
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
